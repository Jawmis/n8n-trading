import { expect, test } from "bun:test";
import { executeRecursive, stableClientOrderIndex } from "./execute";

const workflow = {
  _id: "workflow-1",
  userId: "owner-1",
  nodes: [
    { id: "trigger", nodeId: "timer", type: "timer", position: { x: 0, y: 0 }, data: { kind: "TRIGGER", metadata: { time: 60 } } },
    { id: "trade", nodeId: "lighter", type: "lighter", position: { x: 1, y: 0 }, data: { kind: "ACTION", metadata: { type: "LONG", symbol: "BTC", qty: 1 } } },
  ],
  edges: [{ id: "edge", source: "trigger", target: "trade" }],
};

test("derives one positive safe client order index for each execution action", () => {
  const first = stableClientOrderIndex("execution-1", "trade");
  expect(Number.isSafeInteger(first)).toBe(true);
  expect(first).toBeGreaterThan(0);
  expect(stableClientOrderIndex("execution-1", "trade")).toBe(first);
  expect(stableClientOrderIndex("execution-2", "trade")).not.toBe(first);
  expect(stableClientOrderIndex("execution-1", "other-node")).not.toBe(first);
});

test("persists action intent and submission state before recording the result", async () => {
  const priorMode = process.env.TRADING_MODE;
  const priorQuantity = process.env.MAX_ORDER_QUANTITY;
  const priorNotional = process.env.MAX_ORDER_NOTIONAL;
  process.env.TRADING_MODE = "paper";
  process.env.MAX_ORDER_QUANTITY = "10";
  process.env.MAX_ORDER_NOTIONAL = "1000000";
  const snapshots: Array<Array<{ nodeId: string; status?: string; clientOrderIndex?: number }>> = [];
  try {
    const results = await executeRecursive(
      workflow,
      "trigger",
      new Set(),
      async () => {},
      [],
      async (current) => { snapshots.push(current.map(({ nodeId, status, clientOrderIndex }) => ({ nodeId, status, clientOrderIndex }))); },
      "execution-1",
    );
    const orderIndex = stableClientOrderIndex("execution-1", "trade");
    expect(snapshots.map((snapshot) => snapshot[0]?.status)).toEqual(["pending", "simulating", "success"]);
    expect(snapshots.every((snapshot) => snapshot[0]?.clientOrderIndex === undefined)).toBe(true);
    expect(orderIndex).toBeGreaterThan(0);
    expect(results[0]?.status).toBe("success");
  } finally {
    if (priorMode === undefined) delete process.env.TRADING_MODE;
    else process.env.TRADING_MODE = priorMode;
    if (priorQuantity === undefined) delete process.env.MAX_ORDER_QUANTITY;
    else process.env.MAX_ORDER_QUANTITY = priorQuantity;
    if (priorNotional === undefined) delete process.env.MAX_ORDER_NOTIONAL;
    else process.env.MAX_ORDER_NOTIONAL = priorNotional;
  }
});
