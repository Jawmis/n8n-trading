import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ExecutionModel, WorkflowModel } from "db/client";
import { pollOnce } from "./index";

const workflow = {
  _id: "workflow-price-test",
  enabled: true,
  priceState: {} as Record<string, number>,
  nodes: [{ id: "trigger", type: "price-trigger", data: { kind: "TRIGGER", metadata: { asset: "BTC", price: 100, direction: "ABOVE" } } }],
  edges: [],
};

const originals = {
  workflowFind: WorkflowModel.find,
  workflowUpdateOne: WorkflowModel.updateOne,
  executionCreate: ExecutionModel.create,
  executionUpdateMany: ExecutionModel.updateMany,
  executionFindOneAndUpdate: ExecutionModel.findOneAndUpdate,
};

beforeEach(() => {
  workflow.priceState = {};
  process.env.PRICE_FEED_MAX_AGE_MS = "30000";
});

afterEach(() => {
  WorkflowModel.find = originals.workflowFind;
  WorkflowModel.updateOne = originals.workflowUpdateOne;
  ExecutionModel.create = originals.executionCreate;
  ExecutionModel.updateMany = originals.executionUpdateMany;
  ExecutionModel.findOneAndUpdate = originals.executionFindOneAndUpdate;
  delete (globalThis as typeof globalThis & { PRICE_FEED?: unknown }).PRICE_FEED;
});

describe("price trigger executor integration", () => {
  test("persists the seed quote and enqueues only on a later crossing", async () => {
    const enqueued: Record<string, unknown>[] = [];
    let quote = 99;
    WorkflowModel.find = (async () => [workflow]) as typeof WorkflowModel.find;
    WorkflowModel.updateOne = (async (_filter, update) => {
      const path = "priceState.trigger";
      workflow.priceState.trigger = (update as { $set: Record<string, number> }).$set[path]!;
      return { acknowledged: true, modifiedCount: 1 };
    }) as typeof WorkflowModel.updateOne;
    ExecutionModel.create = (async (job) => { enqueued.push(job as Record<string, unknown>); return job; }) as typeof ExecutionModel.create;
    ExecutionModel.updateMany = (async () => ({ acknowledged: true, modifiedCount: 0 })) as unknown as typeof ExecutionModel.updateMany;
    ExecutionModel.findOneAndUpdate = (async () => null) as unknown as typeof ExecutionModel.findOneAndUpdate;
    (globalThis as typeof globalThis & { PRICE_FEED?: unknown }).PRICE_FEED = { getPrice: async () => ({ price: quote, timestamp: 100_000 }) };

    await pollOnce(100_000);
    expect(workflow.priceState.trigger).toBe(99);
    expect(enqueued).toHaveLength(0);
    quote = 101;
    await pollOnce(100_001);
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]?.kind).toBe("price");
    expect(String(enqueued[0]?.queueKey)).toContain("workflow-price-test:trigger:");
  });
});
