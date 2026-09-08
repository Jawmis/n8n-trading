import type { LighterOrder } from "./executors/lighter";

export type TradingMode = "paper" | "live";

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

  if (killSwitch) throw new Error("Trading kill switch is enabled");
  if (mode === "live" && !liveTradingEnabled) throw new Error("Live trading is disabled");
  if (!allowedAssets.has(order.asset)) throw new Error(`Trading asset is not allowed: ${order.asset}`);
  if (maxQuantity <= 0 || order.quantity > maxQuantity) throw new Error("Order quantity exceeds the configured risk limit");
  if (!Number.isFinite(marketPrice) || marketPrice <= 0 || order.quantity * marketPrice > maxNotional) throw new Error("Order notional exceeds the configured risk limit");
  return { mode, maxQuantity, maxNotional };
}
