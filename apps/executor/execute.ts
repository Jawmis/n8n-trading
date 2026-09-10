import mongoose from "mongoose";
import { CredentialModel, ExecutionModel } from "db/client";
import { decryptCredential } from "db/credentials";
import { dispatchAction } from "./executors";
import { validateWorkflowGraph } from "common/types";

export interface WorkflowNodeLike {
  id: string;
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
  edges: { source: string; target: string }[];
}
const status = { pending: "pending", success: "success", failure: "failure" } as const;
const isAction = (node: WorkflowNodeLike) => String(node.data?.kind).toLowerCase() === "action";

export async function executeRecursive(workflow: WorkflowLike, currentNodeId: string, visited = new Set<string>()): Promise<void> {
  if (visited.has(currentNodeId)) return;
  visited.add(currentNodeId);
  const children = workflow.edges.filter((edge) => edge.source === currentNodeId)
    .map((edge) => workflow.nodes.find((node) => node.id === edge.target))
    .filter((node): node is WorkflowNodeLike => Boolean(node));
  await Promise.all(children.map(async (node) => {
    if (isAction(node)) {
      if (!node.credentialId || !workflow.userId) throw new Error(`Action node ${node.id} has no credential reference`);
      const credential = await CredentialModel.findOne({ _id: node.credentialId, userId: workflow.userId, revokedAt: null }).select("ciphertext iv authTag");
      if (!credential) throw new Error(`Credential not found for action node ${node.id}`);
      await dispatchAction({
        ...node,
        credentials: decryptCredential(credential.toObject()),
      });
    }
    await executeRecursive(workflow, node.id, new Set(visited));
  }));
}

export async function executeWorkflow(workflow: WorkflowLike, executionId?: unknown) {
  const trigger = workflow.nodes.find((node) => String(node.data?.kind).toLowerCase() === "trigger");
  if (!trigger) throw new Error("Workflow has no trigger node");
  const graph = validateWorkflowGraph(workflow);
  if (!graph.success) throw new Error(`Workflow validation failed: ${graph.message}`);
  const execution = executionId
    ? await ExecutionModel.findById(executionId)
    : await ExecutionModel.create({ workflowId: workflow._id, kind: "manual", status: status.pending, startTime: new Date() });
  if (!execution) throw new Error("Execution job not found");
  const heartbeat = executionId
    ? setInterval(() => {
        void ExecutionModel.updateOne(
          { _id: execution._id, status: "running" },
          { $set: { leaseUntil: new Date(Date.now() + 60_000) } },
        );
      }, 10_000)
    : undefined;
  try {
    await executeRecursive(workflow, trigger.id);
    await ExecutionModel.updateOne({ _id: execution._id }, { $set: { status: status.success, endTime: new Date(), leaseUntil: null }, $unset: { queueKey: 1 } });
    return execution._id;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await ExecutionModel.updateOne({ _id: execution._id }, { $set: { status: status.failure, endTime: new Date(), error: message, leaseUntil: null }, $unset: { queueKey: 1 } });
    throw error;
  } finally {
    if (heartbeat) clearInterval(heartbeat);
  }
}
