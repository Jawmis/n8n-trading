import type { WorkflowNodeLike } from "../execute";
const assets = new Set(["SOL", "BTC", "ETH"]);
export interface LighterOrder { asset: "SOL" | "BTC" | "ETH"; quantity: number; side: "long" | "short"; price?: number; apiKey: string; accountIndex: string | number; apiIndex: string | number; }
export interface LighterClient { getMarketPrice(asset: string): Promise<{ price: number; priceDecimals?: number; quantityDecimals?: number }>; placeOrder(order: LighterOrder & { price: number }): Promise<unknown>; }

export function parseLighterOrder(node: WorkflowNodeLike): LighterOrder {
  const metadata = node.data?.metadata ?? {}, credentials = node.credentials ?? {};
  const asset = String(metadata.asset ?? metadata.symbol ?? "").toUpperCase();
  const quantity = Number(metadata.quantity ?? metadata.qty);
  const side = String(metadata.type ?? metadata.side ?? "").toLowerCase();
  if (!assets.has(asset)) throw new Error(`Unsupported Lighter asset: ${asset || "missing"}`);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Lighter quantity must be greater than zero");
  if (!["long", "short", "ask", "bid"].includes(side)) throw new Error("Lighter order side must be long/short");
  if (!credentials.apiKey || credentials.accountIndex === undefined || credentials.apiIndex === undefined) throw new Error("Lighter credentials require apiKey, accountIndex, and apiIndex");
  return { asset: asset as LighterOrder["asset"], quantity, side: side === "bid" ? "long" : side === "ask" ? "short" : side as "long" | "short", apiKey: String(credentials.apiKey), accountIndex: credentials.accountIndex as string | number, apiIndex: credentials.apiIndex as string | number };
}

export async function executeLighter(node: WorkflowNodeLike, client?: LighterClient) {
  const order = parseLighterOrder(node);
  const exchange = client ?? (globalThis as typeof globalThis & { LIGHTER_CLIENT?: LighterClient }).LIGHTER_CLIENT;
  if (!exchange) throw new Error("No Lighter client configured (inject one or set globalThis.LIGHTER_CLIENT)");
  const market = await exchange.getMarketPrice(order.asset);
  if (!Number.isFinite(market.price) || market.price <= 0) throw new Error("Lighter returned an invalid market price");
  const round = (value: number, decimals: number) => Number(value.toFixed(decimals));
  return exchange.placeOrder({ ...order, quantity: round(order.quantity, market.quantityDecimals ?? 4), price: round(order.price ?? market.price, market.priceDecimals ?? 2) });
}
