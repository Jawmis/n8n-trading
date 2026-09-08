import { describe, expect, test } from "bun:test";
import { validateWorkflowGraph } from "./types";

const timer = (id = "trigger") => ({ nodeId: "timer", type: "timer", id, data: { kind: "TRIGGER", metadata: { time: 60 } }, position: { x: 0, y: 0 } });
const action = (id = "action") => ({ nodeId: "lighter", type: "lighter", id, data: { kind: "ACTION", metadata: { type: "LONG", qty: 1, symbol: "BTC" } }, position: { x: 1, y: 1 } });

describe("workflow graph validation", () => {
    test("accepts a connected acyclic workflow", () => {
        expect(validateWorkflowGraph({ nodes: [timer(), action()], edges: [{ id: "e1", source: "trigger", target: "action" }] }).success).toBe(true);
    });
    test.each([
        ["multiple triggers", [timer(), timer("trigger-2")], []],
        ["duplicate node IDs", [timer(), action("trigger")], []],
        ["missing edge node", [timer(), action()], [{ id: "e1", source: "trigger", target: "missing" }]],
        ["cycle", [timer(), action()], [{ id: "e1", source: "trigger", target: "action" }, { id: "e2", source: "action", target: "trigger" }]],
        ["orphan node", [timer(), action(), action("orphan")], [{ id: "e1", source: "trigger", target: "action" }]],
    ])("rejects %s", (_name, nodes, edges) => {
        expect(validateWorkflowGraph({ nodes, edges }).success).toBe(false);
    });
});
