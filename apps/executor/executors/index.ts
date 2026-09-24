import type { WorkflowNodeLike } from "../execute";
import { executeLighter } from "./lighter";
export type ActionExecutor = (node: WorkflowNodeLike, beforeSubmit?: () => Promise<void>) => Promise<unknown>;
const handlers: Record<string, ActionExecutor> = {
  lighter: (node, beforeSubmit) => executeLighter(node, undefined, beforeSubmit),
};
export async function dispatchAction(node: WorkflowNodeLike, beforeSubmit?: () => Promise<void>) {
  const type = String(node.type ?? node.data?.metadata?.type ?? "").toLowerCase();
  const handler = handlers[type];
  if (!handler) throw new Error(`Unsupported action node type: ${type || "unknown"}`);
  return handler(node, beforeSubmit);
}
export { executeLighter } from "./lighter";
