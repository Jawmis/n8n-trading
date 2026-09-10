import { beforeEach, describe, expect, test } from "bun:test";
import { executeLighter } from "./lighter";

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
  process.env.MAX_ORDER_QUANTITY = "2";
  process.env.MAX_ORDER_NOTIONAL = "100000";
  process.env.MAX_ORDER_SLIPPAGE_BPS = "0";
  (globalThis as typeof globalThis & { LIGHTER_CLIENT?: unknown }).LIGHTER_CLIENT = undefined;
});

describe("Lighter action adapter", () => {
  test("redacts credentials and normalizes paper orders", async () => {
    (globalThis as typeof globalThis & { LIGHTER_CLIENT?: unknown }).LIGHTER_CLIENT = {
      getMarketPrice: async () => ({ price: 100.123, priceDecimals: 2, quantityDecimals: 3 }),
      placeOrder: async () => { throw new Error("paper mode must not submit"); },
    };
    const result = await executeLighter(node);
    expect(result).toEqual({ mode: "paper", order: { asset: "BTC", quantity: 1, side: "long", price: 100.12, leverage: undefined, reduceOnly: true, apiKey: "[redacted]", accountIndex: 7, apiIndex: 2 } });
  });

  test("dispatches a live order with normalized precision and reduce-only intent", async () => {
    process.env.TRADING_MODE = "live";
    process.env.LIVE_TRADING_ENABLED = "true";
    let submitted: Record<string, unknown> | undefined;
    (globalThis as typeof globalThis & { LIGHTER_CLIENT?: unknown }).LIGHTER_CLIENT = {
      getMarketPrice: async () => ({ price: 100.123, priceDecimals: 2, quantityDecimals: 3 }),
      placeOrder: async (order: Record<string, unknown>) => { submitted = order; return { transactionHash: "tx-1" }; },
    };
    await executeLighter(node);
    expect(submitted).toMatchObject({ asset: "BTC", quantity: 1, side: "long", price: 100.12, reduceOnly: true });
    expect(submitted?.apiKey).toBe("private-key");
  });
});
