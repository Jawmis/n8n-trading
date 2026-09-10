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

export function validateTradeRisk(order: LighterOrder, marketPrice: number) {
  const mode: TradingMode = process.env.TRADING_MODE === "live" ? "live" : "paper";
  const liveTradingEnabled = boolEnv("LIVE_TRADING_ENABLED", false);
  const killSwitch = boolEnv("TRADING_KILL_SWITCH", false);
  const allowedAssets = new Set((process.env.ALLOWED_TRADING_ASSETS ?? "SOL,BTC,ETH").split(",").map((asset) => asset.trim().toUpperCase()).filter(Boolean));
  const maxQuantity = numberEnv("MAX_ORDER_QUANTITY", 0);
  const maxNotional = numberEnv("MAX_ORDER_NOTIONAL", 0);

  if (killSwitch) reject("KILL_SWITCH", "Trading kill switch is enabled");
  if (mode === "live" && !liveTradingEnabled) reject("LIVE_TRADING_DISABLED", "Live trading is disabled");
  if (!allowedAssets.has(order.asset)) reject("ASSET_NOT_ALLOWED", `Trading asset is not allowed: ${order.asset}`, { asset: order.asset });
  if (maxQuantity <= 0 || order.quantity > maxQuantity) reject("QUANTITY_LIMIT", "Order quantity exceeds the configured risk limit", { quantity: order.quantity, maxQuantity });
  if (!Number.isFinite(marketPrice) || marketPrice <= 0 || order.quantity * marketPrice > maxNotional) reject("NOTIONAL_LIMIT", "Order notional exceeds the configured risk limit", { notional: order.quantity * marketPrice, maxNotional });
  return { mode, maxQuantity, maxNotional };
}
