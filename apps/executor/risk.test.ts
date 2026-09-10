import { beforeEach, describe, expect, test } from "bun:test";
import { TradeRiskRejection, validateTradeRisk } from "./risk";
import type { LighterOrder } from "./executors/lighter";

const order: LighterOrder = { asset: "BTC", quantity: 1, side: "long", apiKey: "secret", accountIndex: 1, apiIndex: 1 };

beforeEach(() => {
  delete process.env.TRADING_MODE;
  delete process.env.LIVE_TRADING_ENABLED;
  delete process.env.TRADING_KILL_SWITCH;
  delete process.env.MAX_ORDER_LEVERAGE;
  delete process.env.MAX_ORDER_SLIPPAGE_BPS;
  process.env.MAX_ORDER_QUANTITY = "2";
  process.env.MAX_ORDER_NOTIONAL = "100000";
  process.env.ALLOWED_TRADING_ASSETS = "BTC,ETH";
});

describe("trade risk policy", () => {
  test("defaults to paper mode", () => expect(validateTradeRisk(order, 100).mode).toBe("paper"));
  test("rejects disabled live trading", () => {
    process.env.TRADING_MODE = "live";
    expect(() => validateTradeRisk(order, 100)).toThrow("Live trading is disabled");
    try {
      validateTradeRisk(order, 100);
    } catch (error) {
      expect(error).toBeInstanceOf(TradeRiskRejection);
    }
  });
  test("rejects the kill switch, disallowed assets, quantity, and notional", () => {
    process.env.TRADING_KILL_SWITCH = "true";
    expect(() => validateTradeRisk(order, 100)).toThrow("kill switch");
    process.env.TRADING_KILL_SWITCH = "false";
    expect(() => validateTradeRisk({ ...order, asset: "SOL" }, 100)).toThrow("not allowed");
    expect(() => validateTradeRisk({ ...order, quantity: 3 }, 100)).toThrow("quantity");
    expect(() => validateTradeRisk(order, 100_001)).toThrow("notional");
  });
  test("rejects excessive leverage and limit-price slippage", () => {
    process.env.MAX_ORDER_LEVERAGE = "2";
    process.env.MAX_ORDER_SLIPPAGE_BPS = "50";
    expect(() => validateTradeRisk({ ...order, leverage: 3 }, 100)).toThrow("leverage");
    expect(() => validateTradeRisk({ ...order, price: 101 }, 100)).toThrow("slippage");
    expect(validateTradeRisk({ ...order, leverage: 2, price: 100.4 }, 100).maxLeverage).toBe(2);
  });
  test("does not apply limit slippage to market orders without a requested price", () => {
    process.env.MAX_ORDER_SLIPPAGE_BPS = "0";
    expect(validateTradeRisk(order, 100.123).mode).toBe("paper");
  });
});
