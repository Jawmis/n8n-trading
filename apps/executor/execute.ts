import mongoose from "mongoose";
import { createHash } from "node:crypto";
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
  clientOrderIndex?: number;
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
export type ActionResult = { nodeId: string; clientOrderIndex?: number; result?: unknown; status?: "pending" | "simulating" | "submitting" | "uncertain" | "success" | "failure"; error?: string };
const status = { pending: "pending", success: "success", failure: "failure" } as const;
const isAction = (node: WorkflowNodeLike) => String(node.data?.kind).toLowerCase() === "action";
const executionTimeoutMs = () => {
  const configured = Number(process.env.EXECUTION_TIMEOUT_MS ?? 300_000);
  return Number.isFinite(configured) && configured > 0 ? Math.min(configured, 300_000) : 300_000;
};

export function stableClientOrderIndex(executionId: string, nodeId: string) {
  const digest = createHash("sha256").update(`${executionId}:${nodeId}`).digest();
  return Math.max(1, digest.readUIntBE(0, 6));
}

export async function executeRecursive(workflow: WorkflowLike, currentNodeId: string, _visited = new Set<string>(), beforeAction: () => Promise<void> = async () => {}, results: ActionResult[] = [], recordResult: (results: ActionResult[]) => Promise<void> = async () => {}, executionId?: string): Promise<ActionResult[]> {
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
        const clientOrderIndex = live && executionId ? stableClientOrderIndex(executionId, node.id) : undefined;
        const intent: ActionResult = { nodeId: node.id, ...(clientOrderIndex === undefined ? {} : { clientOrderIndex }), status: "pending" };
        results.push(intent);
        await recordResult(results);
        const persistActionState = async (status: ActionResult["status"], result?: unknown, error?: string) => {
          const index = results.findIndex((entry) => entry.nodeId === node.id);
          const existing = (index >= 0 ? results[index] : undefined) ?? intent;
          const updated: ActionResult = {
            nodeId: node.id,
            ...(existing.clientOrderIndex === undefined ? {} : { clientOrderIndex: existing.clientOrderIndex }),
            ...(result === undefined ? {} : { result }),
            ...(error === undefined ? {} : { error }),
            status,
          };
          if (index >= 0) results[index] = updated;
          else results.push(updated);
          try {
            await recordResult(results);
          } catch (error) {
            if (index >= 0) results[index] = existing;
            else results.pop();
            throw error;
          }
        };
        if (live && (!node.credentialId || !workflow.userId)) throw new Error(`Action node ${node.id} has no credential reference`);
        const credential = live && node.credentialId && workflow.userId
          ? await CredentialModel.findOne({ _id: node.credentialId, userId: workflow.userId, revokedAt: null }).select("ciphertext iv authTag")
          : null;
        if (live && !credential) throw new Error(`Credential not found for action node ${node.id}`);
        try {
          const result = await dispatchAction(
            { ...node, clientOrderIndex, credentials: credential ? decryptCredential(credential.toObject()) : undefined },
            async () => {
              await beforeAction();
              await persistActionState(live ? "submitting" : "simulating");
            },
          );
          await persistActionState("success", result);
        } catch (error) {
          const index = results.findIndex((entry) => entry.nodeId === node.id);
          const wasSubmitting = index >= 0 && results[index]?.status === "submitting";
          await persistActionState(wasSubmitting ? "uncertain" : "failure", undefined, wasSubmitting
            ? "Broker outcome is uncertain. Reconcile this order before retrying."
            : "Action failed before broker submission.");
          throw error;
        }
      }
    } catch (error) {
      const index = results.findIndex((entry) => entry.nodeId === node.id);
      const existing = index >= 0 ? results[index] : undefined;
      if (!existing || existing.status === "pending" || existing.status === "submitting") {
        const uncertain = existing?.status === "submitting";
        const failed: ActionResult = {
          nodeId: node.id,
          ...(existing?.clientOrderIndex === undefined ? {} : { clientOrderIndex: existing.clientOrderIndex }),
          status: uncertain ? "uncertain" : "failure",
          error: uncertain
            ? "Broker outcome is uncertain. Reconcile this order before retrying."
            : error instanceof TradeRiskRejection ? error.message : "Node execution failed; check credentials, broker availability, and execution state",
        };
        if (index >= 0) results[index] = failed;
        else results.push(failed);
        await recordResult(results);
      }
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
        const filter = { _id: execution._id, status: "running" as const, attempt: execution.attempt };
        void (async () => {
          const uncertainOrder = await ExecutionModel.updateOne(
            { ...filter, results: { $elemMatch: { status: "submitting" } } },
            {
              $set: {
                status: status.failure,
                endTime: new Date(),
                error: "Execution timed out while a broker order outcome was uncertain; reconcile before another run.",
                leaseUntil: null,
                "results.$[order].status": "uncertain",
                "results.$[order].error": "Broker outcome is uncertain. Reconcile this order before retrying.",
              },
              arrayFilters: [{ "order.status": "submitting" }],
            },
          );
          if (uncertainOrder.matchedCount > 0) return;
          await ExecutionModel.updateOne(filter, {
            $set: { status: status.failure, endTime: new Date(), error: "Execution timed out", leaseUntil: null },
            $unset: { queueKey: 1, activeKey: 1 },
          });
        })().catch(() => undefined);
      }, executionTimeoutMs())
    : undefined;
  const results: ActionResult[] = [];
  const deadline = Date.now() + executionTimeoutMs();
  const beforeAction = async () => {
    if (Date.now() >= deadline || !await ExecutionModel.exists({ _id: execution._id, status: "running", attempt: execution.attempt, cancelRequestedAt: { $exists: false } })) throw new Error("Execution is no longer active");
    if (!await WorkflowModel.exists({ _id: workflow._id, enabled: true })) throw new Error("Workflow is disabled or deleted");
  };
  try {
    const graph = validateWorkflowGraph({ nodes: workflow.nodes, edges: workflow.edges });
    if (!graph.success) throw new Error(`Workflow validation failed: ${graph.message}`);
    const trigger = workflow.nodes.find((node) => String(node.data?.kind).toLowerCase() === "trigger");
    if (!trigger) throw new Error("Workflow has no trigger node");
    await beforeAction();
    await executeRecursive(workflow, trigger.id, new Set(), beforeAction, results, async (current) => {
      const update = await ExecutionModel.updateOne({ _id: execution._id, status: "running", attempt: execution.attempt }, { $set: { results: [...current] } });
      if (update.matchedCount === 0) throw new Error("Execution is no longer active");
    }, execution._id.toString());
    const completed = await ExecutionModel.updateOne({ _id: execution._id, status: "running" }, { $set: { status: status.success, endTime: new Date(), leaseUntil: null, results }, $unset: { queueKey: 1, activeKey: 1 } });
    if (completed.modifiedCount === 0) throw new Error("Execution timed out");
    return execution._id;
  } catch (error) {
    const message = error instanceof TradeRiskRejection
      ? JSON.stringify({ code: error.code, message: error.message, details: error.details })
      : "Execution failed; inspect node results before retrying";
    const cancellationRequested = await ExecutionModel.exists({ _id: execution._id, status: "running", attempt: execution.attempt, cancelRequestedAt: { $exists: true } });
    const uncertainOrder = results.some((result) => result.status === "submitting" || result.status === "uncertain");
    await ExecutionModel.updateOne(
      { _id: execution._id, status: "running", attempt: execution.attempt },
      {
        $set: {
          status: cancellationRequested ? "cancelled" : status.failure,
          endTime: new Date(),
          error: cancellationRequested
            ? uncertainOrder ? "Stopped after requesting cancellation; reconcile the broker order before another run." : "Cancelled by user before further actions."
            : uncertainOrder ? "Execution failed with an uncertain broker order outcome; reconcile before another run." : message,
          results,
        },
        $unset: uncertainOrder ? { leaseUntil: 1 } : { queueKey: 1, activeKey: 1, leaseUntil: 1 },
      },
    );
    await ExecutionModel.updateOne({ _id: execution._id, status: { $in: ["cancelled", "failure"] } }, { $set: { results } });
    throw error;
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    if (timeout) clearTimeout(timeout);
  }
}
