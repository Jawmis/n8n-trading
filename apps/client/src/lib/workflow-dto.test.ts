import { describe, expect, test } from "bun:test";
import { editorNodeToWorkflowNode, workflowNodeToEditorNode } from "./workflow-dto";

const apiNode = {
  nodeId: "lighter",
  type: "lighter",
  id: "action-1",
  position: { x: 120, y: 240 },
  credentialId: "credential-1",
  data: { kind: "ACTION" as const, metadata: { type: "LONG", qty: 1, symbol: "BTC" } },
};

describe("workflow DTO mapping", () => {
  test("preserves canonical IDs, credentials, positions, and metadata on round trip", () => {
    const editorNode = workflowNodeToEditorNode(apiNode);
    expect(editorNode.data.kind).toBe("action");
    expect(editorNodeToWorkflowNode(editorNode)).toEqual(apiNode);
  });

  test("normalizes trigger kind without changing the node identity", () => {
    const node = { ...apiNode, nodeId: "timer", type: "timer", credentialId: undefined, data: { kind: "TRIGGER" as const, metadata: { time: 60 } } };
    const editorNode = workflowNodeToEditorNode(node);
    expect(editorNode.data.kind).toBe("trigger");
    expect(editorNodeToWorkflowNode(editorNode)).toEqual({ ...node, credentialId: undefined });
  });
});
