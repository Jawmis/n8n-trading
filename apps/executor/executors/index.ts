import type { WorkflowNodeLike } from "../execute";
import { executeLighter } from "./lighter";
export type ActionExecutor = (node: WorkflowNodeLike) => Promise<unknown>;
const handlers: Record<string, ActionExecutor> = {
  lighter: executeLighter,
};
export async function dispatchAction(node: WorkflowNodeLike) {
  const type = String(node.type ?? node.data?.metadata?.type ?? "").toLowerCase();
  const handler = handlers[type];
  if (!handler) throw new Error(`Unsupported action node type: ${type || "unknown"}`);
  return handler(node);
}
export { executeLighter } from "./lighter";
