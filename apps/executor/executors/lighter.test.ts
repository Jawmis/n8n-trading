import { beforeEach, describe, expect, test } from "bun:test";
import { executeLighter, normalizeOrderBooks } from "./lighter";

const runtimeActive = async () => false;
const reserveOrder = async () => {};

const node = {
  id: "trade",
  type: "lighter",
  data: { kind: "ACTION", metadata: { type: "LONG", symbol: "BTC", qty: 1, reduceOnly: true } },
  credentials: { apiKey: "private-key", accountIndex: 7, apiIndex: 2 },
};

beforeEach(() => {
  delete process.env.TRADING_MODE;
  delete process.env.LIVE_TRADING_ENABLED;
  delete process.env.TRADING_KILL_SWITCH;
  delete process.env.MAX_POSITION_NOTIONAL;
  delete process.env.MAX_ORDERS_PER_MINUTE;
  process.env.MAX_ORDERS_PER_MINUTE = "10";
  process.env.MAX_ORDER_QUANTITY = "2";
  process.env.MAX_ORDER_NOTIONAL = "100000";
  process.env.MAX_ORDER_SLIPPAGE_BPS = "0";
  (globalThis as typeof globalThis & { LIGHTER_CLIENT?: unknown }).LIGHTER_CLIENT = undefined;
});

describe("Lighter action adapter", () => {
  test("normalizes the live API order_books response envelope", () => {
    expect(normalizeOrderBooks({ order_books: [{ symbol: "BTC", market_id: 1 }] })).toEqual([{ symbol: "BTC", market_id: 1 }]);
    expect(normalizeOrderBooks({ unexpected: [] })).toEqual([]);
  });

  test("redacts credentials and normalizes paper orders", async () => {
    (globalThis as typeof globalThis & { LIGHTER_CLIENT?: unknown }).LIGHTER_CLIENT = {
      getMarketPrice: async () => ({ price: 100.123, priceDecimals: 2, quantityDecimals: 3 }),
      placeOrder: async () => { throw new Error("paper mode must not submit"); },
    };
    const result = await executeLighter(node, undefined, undefined, runtimeActive, reserveOrder);
    expect(result).toEqual({ mode: "paper", priceSource: "fixed-demo-reference", order: { asset: "BTC", quantity: 1, side: "long", referencePrice: 100_000, requestedPrice: undefined, leverage: undefined, reduceOnly: true } });
  });

  test("dispatches a live order with normalized precision and reduce-only intent", async () => {
    process.env.TRADING_MODE = "live";
    process.env.LIVE_TRADING_ENABLED = "true";
    process.env.MAX_POSITION_NOTIONAL = "1000000";
    process.env.MAX_ORDERS_PER_MINUTE = "10";
    let submitted: Record<string, unknown> | undefined;
    (globalThis as typeof globalThis & { LIGHTER_CLIENT?: unknown }).LIGHTER_CLIENT = {
      getMarketPrice: async () => ({ price: 100.123, priceDecimals: 2, quantityDecimals: 3 }),
      getPositionNotional: async () => 0,
      placeOrder: async (order: Record<string, unknown>) => { submitted = order; return { transactionHash: "tx-1" }; },
    };
    await executeLighter({ ...node, clientOrderIndex: 1234567890123 }, undefined, undefined, runtimeActive, reserveOrder);
    expect(submitted).toMatchObject({ asset: "BTC", quantity: 1, side: "long", price: 100.12, clientOrderIndex: 1234567890123, reduceOnly: true });
    expect(submitted?.apiKey).toBe("private-key");
  });

  test("checks the shared emergency stop immediately before a paper action", async () => {
    await expect(executeLighter(node, undefined, undefined, async () => true, reserveOrder)).rejects.toThrow("kill switch");
  });

  test("does not submit when the atomic account order-frequency reservation is rejected", async () => {
    process.env.TRADING_MODE = "live";
    process.env.LIVE_TRADING_ENABLED = "true";
    process.env.MAX_POSITION_NOTIONAL = "1000000";
    process.env.MAX_ORDERS_PER_MINUTE = "10";
    let submitted = false;
    (globalThis as typeof globalThis & { LIGHTER_CLIENT?: unknown }).LIGHTER_CLIENT = {
      getMarketPrice: async () => ({ price: 100, priceDecimals: 2, quantityDecimals: 3 }),
      getPositionNotional: async () => 0,
      placeOrder: async () => { submitted = true; return {}; },
    };
    await expect(executeLighter({ ...node, clientOrderIndex: 1234567890123 }, undefined, undefined, runtimeActive, async () => { throw new Error("Account order-frequency limit reached"); })).rejects.toThrow("order-frequency limit");
    expect(submitted).toBe(false);
  });

  test("supports paper short orders", async () => {
    (globalThis as typeof globalThis & { LIGHTER_CLIENT?: unknown }).LIGHTER_CLIENT = {
      getMarketPrice: async () => ({ price: 100, priceDecimals: 2, quantityDecimals: 3 }),
      placeOrder: async () => { throw new Error("paper mode must not submit"); },
    };
    const result = await executeLighter({ ...node, data: { kind: "ACTION", metadata: { type: "SHORT", symbol: "BTC", qty: 1 } } }, undefined, undefined, runtimeActive, reserveOrder);
    expect(result).toMatchObject({ mode: "paper", order: { side: "short", asset: "BTC", quantity: 1 } });
  });

  test("rejects quantities and limit prices beyond broker precision", async () => {
    process.env.TRADING_MODE = "live";
    process.env.LIVE_TRADING_ENABLED = "true";
    (globalThis as typeof globalThis & { LIGHTER_CLIENT?: unknown }).LIGHTER_CLIENT = {
      getMarketPrice: async () => ({ price: 100, priceDecimals: 2, quantityDecimals: 3 }),
      placeOrder: async () => ({ transactionHash: "tx-1" }),
    };
    await expect(executeLighter({ ...node, clientOrderIndex: 1234567890123, data: { kind: "ACTION", metadata: { type: "LONG", symbol: "BTC", qty: 1.0001 } } })).rejects.toThrow("quantity");
    await expect(executeLighter({ ...node, clientOrderIndex: 1234567890123, data: { kind: "ACTION", metadata: { type: "LONG", symbol: "BTC", qty: 1, price: 100.001 } } })).rejects.toThrow("price");
  });
});
