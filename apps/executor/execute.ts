import { ExecutionModel } from "db/client";
import { dispatchAction } from "./executors";

export interface WorkflowNodeLike {
  id: string;
  type?: string;
  data?: { kind?: string; metadata?: Record<string, unknown> };
  credentials?: Record<string, unknown>;
}
export interface WorkflowLike {
  // Mongoose accepts ObjectId values, while tests and adapters commonly use strings.
  _id: any;
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
    if (isAction(node)) await dispatchAction(node);
    await executeRecursive(workflow, node.id, new Set(visited));
  }));
}

export async function executeWorkflow(workflow: WorkflowLike) {
  const trigger = workflow.nodes.find((node) => String(node.data?.kind).toLowerCase() === "trigger");
  if (!trigger) throw new Error("Workflow has no trigger node");
  const execution = await ExecutionModel.create({ workflowId: workflow._id, status: status.pending, startTime: new Date() });
  try {
    await executeRecursive(workflow, trigger.id);
    await ExecutionModel.updateOne({ _id: execution._id }, { $set: { status: status.success, endTime: new Date() } });
    return execution._id;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await ExecutionModel.updateOne({ _id: execution._id }, { $set: { status: status.failure, endTime: new Date(), error: message } });
    throw error;
  }
}
