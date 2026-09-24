import mongoose from "mongoose";
import { CredentialModel, ExecutionModel, WorkflowModel } from "db/client";
import { decryptCredential } from "db/credentials";
import { dispatchAction } from "./executors";
import { validateWorkflowGraph } from "common/types";
import { TradeRiskRejection } from "./risk";

export interface WorkflowNodeLike {
  id: string;
  nodeId?: string;
  position?: { x: number; y: number };
  type?: string;
  data?: { kind?: string; metadata?: Record<string, unknown> };
  credentials?: Record<string, unknown>;
  credentialId?: string;
}
export interface WorkflowLike {
  // Mongoose accepts ObjectId values, while tests and adapters commonly use strings.
  _id: mongoose.Types.ObjectId | string;
  userId?: mongoose.Types.ObjectId | string;
  runRequestedAt?: Date | string;
  nodes: WorkflowNodeLike[];
  edges: { id?: string; source: string; target: string }[];
  priceState?: Record<string, number>;
  enabled?: boolean;
  published?: WorkflowLike & { revision: number };
}
export type ActionResult = { nodeId: string; result?: unknown; status?: "success" | "failure"; error?: string };
const status = { pending: "pending", success: "success", failure: "failure" } as const;
const isAction = (node: WorkflowNodeLike) => String(node.data?.kind).toLowerCase() === "action";
const executionTimeoutMs = () => {
  const configured = Number(process.env.EXECUTION_TIMEOUT_MS ?? 300_000);
  return Number.isFinite(configured) && configured > 0 ? configured : 300_000;
};

export async function executeRecursive(workflow: WorkflowLike, currentNodeId: string, _visited = new Set<string>(), beforeAction: () => Promise<void> = async () => {}, results: ActionResult[] = [], recordResult: (results: ActionResult[]) => Promise<void> = async () => {}): Promise<ActionResult[]> {
  const nodes = new Map(workflow.nodes.map((node) => [node.id, node]));
  const pending = new Map(workflow.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map<string, string[]>();
  for (const edge of workflow.edges) {
    pending.set(edge.target, (pending.get(edge.target) ?? 0) + 1);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  }
  const ready = [currentNodeId];
  let visited = 0;
  while (ready.length) {
    const id = ready.shift()!;
    const node = nodes.get(id);
    if (!node) throw new Error(`Missing workflow node ${id}`);
    visited++;
    try {
      await beforeAction();
      if (isAction(node)) {
        const live = process.env.TRADING_MODE === "live";
        if (live && (!node.credentialId || !workflow.userId)) throw new Error(`Action node ${node.id} has no credential reference`);
        const credential = live && node.credentialId && workflow.userId
          ? await CredentialModel.findOne({ _id: node.credentialId, userId: workflow.userId, revokedAt: null }).select("ciphertext iv authTag")
          : null;
        if (live && !credential) throw new Error(`Credential not found for action node ${node.id}`);
        const result = await dispatchAction({ ...node, credentials: credential ? decryptCredential(credential.toObject()) : undefined }, beforeAction);
        results.push({ nodeId: node.id, result, status: "success" });
        await recordResult(results);
      }
    } catch (error) {
      results.push({ nodeId: node.id, status: "failure", error: error instanceof TradeRiskRejection ? error.message : "Node execution failed; check credentials, broker availability, and execution state" });
      await recordResult(results);
      throw error;
    }
    for (const child of outgoing.get(id) ?? []) {
      const remaining = (pending.get(child) ?? 0) - 1;
      pending.set(child, remaining);
      if (remaining === 0) ready.push(child);
    }
  }
  if (visited !== workflow.nodes.length) throw new Error("Workflow graph contains an unreachable or cyclic node");
  return results;
}

export async function executeWorkflow(workflow: WorkflowLike, executionId?: unknown) {
  const execution = executionId
    ? await ExecutionModel.findById(executionId)
    : await ExecutionModel.create({ workflowId: workflow._id, kind: "manual", status: "running", startTime: new Date() });
  if (!execution) throw new Error("Execution job not found");
  const heartbeat = executionId
    ? setInterval(() => {
        void ExecutionModel.updateOne(
          { _id: execution._id, status: "running" },
          { $set: { leaseUntil: new Date(Date.now() + 60_000) } },
        ).catch(() => undefined);
      }, 10_000)
    : undefined;
  const timeout = executionId
    ? setTimeout(() => {
        void ExecutionModel.updateOne(
          { _id: execution._id, status: "running" },
          {
            $set: { status: status.failure, endTime: new Date(), error: "Execution timed out", leaseUntil: null },
            $unset: { queueKey: 1, activeKey: 1 },
          },
        ).catch(() => undefined);
      }, executionTimeoutMs())
    : undefined;
  const results: ActionResult[] = [];
  const deadline = Date.now() + executionTimeoutMs();
  const beforeAction = async () => {
    if (Date.now() >= deadline || !await ExecutionModel.exists({ _id: execution._id, status: "running", attempt: execution.attempt })) throw new Error("Execution is no longer active");
    if (!await WorkflowModel.exists({ _id: workflow._id, enabled: true })) throw new Error("Workflow is disabled or deleted");
  };
  try {
    const graph = validateWorkflowGraph({ nodes: workflow.nodes, edges: workflow.edges });
    if (!graph.success) throw new Error(`Workflow validation failed: ${graph.message}`);
    const trigger = workflow.nodes.find((node) => String(node.data?.kind).toLowerCase() === "trigger");
    if (!trigger) throw new Error("Workflow has no trigger node");
    await beforeAction();
    await executeRecursive(workflow, trigger.id, new Set(), beforeAction, results, async (current) => {
      await ExecutionModel.updateOne({ _id: execution._id, status: "running" }, { $set: { results: [...current] } });
    });
    const completed = await ExecutionModel.updateOne({ _id: execution._id, status: "running" }, { $set: { status: status.success, endTime: new Date(), leaseUntil: null, results }, $unset: { queueKey: 1, activeKey: 1 } });
    if (completed.modifiedCount === 0) throw new Error("Execution timed out");
    return execution._id;
  } catch (error) {
    const message = error instanceof TradeRiskRejection
      ? JSON.stringify({ code: error.code, message: error.message, details: error.details })
      : "Execution failed; inspect node results before retrying";
    await ExecutionModel.updateOne({ _id: execution._id, status: "running" }, { $set: { status: status.failure, endTime: new Date(), error: message, leaseUntil: null, results }, $unset: { queueKey: 1, activeKey: 1 } });
    await ExecutionModel.updateOne({ _id: execution._id, status: { $in: ["cancelled", "failure"] } }, { $set: { results } });
    throw error;
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    if (timeout) clearTimeout(timeout);
  }
}
