import type { LighterOrder } from "./executors/lighter";

export type TradingMode = "paper" | "live";

export class TradeRiskRejection extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "TradeRiskRejection";
    this.code = code;
    this.details = details;
  }
}

function reject(code: string, message: string, details?: Record<string, unknown>): never {
  throw new TradeRiskRejection(code, message, details);
}

function boolEnv(name: string, fallback: boolean) {
  const value = process.env[name];
  return value === undefined ? fallback : value.toLowerCase() === "true";
}

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function validateTradeRisk(order: LighterOrder, marketPrice: number, currentPositionNotional?: number) {
  const mode: TradingMode = process.env.TRADING_MODE === "live" ? "live" : "paper";
  const liveTradingEnabled = boolEnv("LIVE_TRADING_ENABLED", false);
  const killSwitch = boolEnv("TRADING_KILL_SWITCH", false);
  const allowedAssets = new Set((process.env.ALLOWED_TRADING_ASSETS ?? "SOL,BTC,ETH").split(",").map((asset) => asset.trim().toUpperCase()).filter(Boolean));
  const maxQuantity = numberEnv("MAX_ORDER_QUANTITY", 0);
  const maxNotional = numberEnv("MAX_ORDER_NOTIONAL", 0);
  const maxLeverage = numberEnv("MAX_ORDER_LEVERAGE", 1);
  const maxSlippageBps = numberEnv("MAX_ORDER_SLIPPAGE_BPS", 0);
  const maxPositionNotional = numberEnv("MAX_POSITION_NOTIONAL", 0);

  if (killSwitch) reject("KILL_SWITCH", "Trading kill switch is enabled");
  if (mode === "live" && !liveTradingEnabled) reject("LIVE_TRADING_DISABLED", "Live trading is disabled");
  if (!allowedAssets.has(order.asset)) reject("ASSET_NOT_ALLOWED", `Trading asset is not allowed: ${order.asset}`, { asset: order.asset });
  if (order.leverage !== undefined && (!Number.isFinite(order.leverage) || order.leverage <= 0 || order.leverage > maxLeverage)) {
    reject("LEVERAGE_LIMIT", "Order leverage exceeds the configured risk limit", { leverage: order.leverage, maxLeverage });
  }
  if (maxQuantity <= 0 || order.quantity > maxQuantity) reject("QUANTITY_LIMIT", "Order quantity exceeds the configured risk limit", { quantity: order.quantity, maxQuantity });
  const notional = order.quantity * marketPrice;
  if (!Number.isFinite(marketPrice) || marketPrice <= 0 || notional > maxNotional) reject("NOTIONAL_LIMIT", "Order notional exceeds the configured risk limit", { notional, maxNotional });
  if (maxPositionNotional > 0) {
    if (!Number.isFinite(currentPositionNotional)) reject("POSITION_UNAVAILABLE", "Current position is required for the configured position limit");
    const position = currentPositionNotional!;
    const projected = order.reduceOnly ? position : position + (order.side === "long" ? notional : -notional);
    if (Math.abs(projected) > maxPositionNotional) reject("POSITION_LIMIT", "Projected position exceeds the configured risk limit", { currentPositionNotional, projected, maxPositionNotional });
  }
  if (order.price !== undefined) {
    const slippageBps = Math.abs(order.price - marketPrice) / marketPrice * 10_000;
    if (!Number.isFinite(order.price) || order.price <= 0 || slippageBps > maxSlippageBps) {
      reject("SLIPPAGE_LIMIT", "Order price exceeds the configured slippage limit", { price: order.price, marketPrice, slippageBps, maxSlippageBps });
    }
  }
  return { mode, maxQuantity, maxNotional, maxLeverage, maxSlippageBps, maxPositionNotional };
}
