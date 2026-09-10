import type { WorkflowNode } from "./http";

export type EditorWorkflowNode = {
  id: string;
  nodeId: string;
  type: string;
  position: { x: number; y: number };
  selected?: boolean;
  data: { kind: "action" | "trigger"; metadata: unknown };
  credentialId?: string;
};

export function workflowNodeToEditorNode(node: WorkflowNode): EditorWorkflowNode {
  return {
    id: node.id,
    nodeId: node.nodeId,
    type: node.type,
    position: node.position,
    data: {
      kind: node.data.kind === "ACTION" ? "action" : "trigger",
      metadata: node.data.metadata,
    },
    ...(node.credentialId ? { credentialId: node.credentialId } : {}),
  };
}

export function editorNodeToWorkflowNode(node: EditorWorkflowNode): WorkflowNode {
  return {
    nodeId: node.nodeId,
    type: node.type,
    id: node.id,
    position: node.position,
    ...(node.credentialId ? { credentialId: node.credentialId } : {}),
    data: {
      kind: node.data.kind === "action" ? "ACTION" : "TRIGGER",
      metadata: node.data.metadata,
    },
  };
}
