import type { WorkflowNodeLike } from "../execute";
import { executeLighter } from "./lighter";
export type ActionExecutor = (node: WorkflowNodeLike) => Promise<unknown>;
const handlers: Record<string, ActionExecutor> = {
  lighter: executeLighter,
  hyperliquid: async () => { throw new Error("Hyperliquid executor is not implemented"); },
  backpack: async () => { throw new Error("Backpack executor is not implemented"); },
  sendemail: async () => { throw new Error("sendEmail executor is not implemented"); },
};
export async function dispatchAction(node: WorkflowNodeLike) {
  const type = String(node.type ?? node.data?.metadata?.type ?? "").toLowerCase();
  const handler = handlers[type];
  if (!handler) throw new Error(`Unsupported action node type: ${type || "unknown"}`);
  return handler(node);
}
export { executeLighter } from "./lighter";
