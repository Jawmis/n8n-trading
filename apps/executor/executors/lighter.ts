import type { WorkflowNodeLike } from "../execute";
import { validateTradeRisk } from "../risk";
import { ApiClient, MarketHelper, OrderApi, SignerClient, resolveNetworkFromEnv } from "lighter-ts-sdk";
const assets = new Set(["SOL", "BTC", "ETH"]);
export interface LighterOrder { asset: "SOL" | "BTC" | "ETH"; quantity: number; side: "long" | "short"; price?: number; leverage?: number; reduceOnly?: boolean; apiKey: string; accountIndex: string | number; apiIndex: string | number; }
export interface LighterClient { getMarketPrice(asset: string): Promise<{ price: number; priceDecimals?: number; quantityDecimals?: number }>; placeOrder(order: LighterOrder & { price: number }): Promise<unknown>; close?: () => Promise<void>; }

type Market = { helper: MarketHelper; priceDecimals: number; quantityDecimals: number };

/** Signed production adapter backed by the Lighter SDK's WASM signer. */
export class SdkLighterClient implements LighterClient {
  private readonly apiClient: ApiClient;
  private readonly orderApi: OrderApi;
  private readonly signer?: SignerClient;
  private readonly markets = new Map<string, Market>();

  constructor(credentials: { apiPrivateKey?: string; apiKey?: string; accountIndex: string | number; apiIndex: string | number }) {
    const network = resolveNetworkFromEnv();
    const apiUrl = process.env.LIGHTER_API_URL ?? network.apiUrl;
    this.apiClient = new ApiClient({ host: apiUrl });
    this.orderApi = new OrderApi(this.apiClient);
    const privateKey = credentials.apiPrivateKey ?? credentials.apiKey;
    if (privateKey) {
      this.signer = new SignerClient({ url: apiUrl, network, privateKey, accountIndex: Number(credentials.accountIndex), apiKeyIndex: Number(credentials.apiIndex) });
    }
  }

  private async market(asset: string) {
    const normalized = asset.toUpperCase();
    const cached = this.markets.get(normalized);
    if (cached) return cached;
    const books = await this.orderApi.getOrderBooks();
    const book = books.find((candidate) => candidate.symbol.toUpperCase() === normalized || candidate.symbol.toUpperCase().startsWith(`${normalized}-`));
    if (!book) throw new Error(`Lighter market not found for ${normalized}`);
    const helper = new MarketHelper(book.market_id, this.orderApi);
    await helper.initialize();
    const details = await this.orderApi.getOrderBookDetails({ market_id: book.market_id });
    const market = { helper, priceDecimals: details.price_decimals, quantityDecimals: details.size_decimals };
    this.markets.set(normalized, market);
    return market;
  }

  async getMarketPrice(asset: string) {
    const market = await this.market(asset);
    const price = market.helper.unitsToPrice(market.helper.lastPrice);
    if (!Number.isFinite(price) || price <= 0) throw new Error(`Lighter returned an invalid ${asset} price`);
    return { price, priceDecimals: market.priceDecimals, quantityDecimals: market.quantityDecimals };
  }

  async placeOrder(order: LighterOrder & { price: number }) {
    if (!this.signer) throw new Error("Lighter live trading requires an API private key");
    const market = await this.market(order.asset);
    await this.signer.initialize();
    const [result, hash, error] = await this.signer.createMarketOrder({
      marketIndex: market.helper.getConfig().index,
      clientOrderIndex: Date.now(),
      baseAmount: market.helper.amountToUnits(order.quantity),
      avgExecutionPrice: market.helper.priceToUnits(order.price),
      isAsk: order.side === "short",
      reduceOnly: order.reduceOnly ?? false,
    });
    if (error || !hash) throw new Error(`Lighter order rejected: ${error ?? "missing transaction hash"}`);
    return { transactionHash: hash, order: result };
  }

  async close() {
    await this.signer?.close();
    await this.apiClient.close();
  }
}

export function createLighterClient(credentials: Record<string, unknown>) {
  return new SdkLighterClient({
    apiPrivateKey: typeof credentials.apiPrivateKey === "string" ? credentials.apiPrivateKey : undefined,
    apiKey: typeof credentials.apiKey === "string" ? credentials.apiKey : undefined,
    accountIndex: String(credentials.accountIndex ?? ""),
    apiIndex: String(credentials.apiIndex ?? ""),
  });
}

export function parseLighterOrder(node: WorkflowNodeLike): LighterOrder {
  const metadata = node.data?.metadata ?? {}, credentials = node.credentials ?? {};
  const asset = String(metadata.asset ?? metadata.symbol ?? "").toUpperCase();
  const quantity = Number(metadata.quantity ?? metadata.qty);
  const side = String(metadata.type ?? metadata.side ?? "").toLowerCase();
  if (!assets.has(asset)) throw new Error(`Unsupported Lighter asset: ${asset || "missing"}`);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Lighter quantity must be greater than zero");
  if (!["long", "short", "ask", "bid"].includes(side)) throw new Error("Lighter order side must be long/short");
  if (!credentials.apiKey || credentials.accountIndex === undefined || credentials.apiIndex === undefined) throw new Error("Lighter credentials require apiKey, accountIndex, and apiIndex");
  const leverage = metadata.leverage === undefined ? undefined : Number(metadata.leverage);
  if (leverage !== undefined && (!Number.isFinite(leverage) || leverage <= 0)) throw new Error("Lighter leverage must be greater than zero");
  return { asset: asset as LighterOrder["asset"], quantity, side: side === "bid" ? "long" : side === "ask" ? "short" : side as "long" | "short", price: metadata.price === undefined ? undefined : Number(metadata.price), leverage, reduceOnly: metadata.reduceOnly === true, apiKey: String(credentials.apiKey), accountIndex: credentials.accountIndex as string | number, apiIndex: credentials.apiIndex as string | number };
}

export async function executeLighter(node: WorkflowNodeLike, client?: LighterClient) {
  const order = parseLighterOrder(node);
  const exchange = client ?? (globalThis as typeof globalThis & { LIGHTER_CLIENT?: LighterClient }).LIGHTER_CLIENT ?? createLighterClient(node.credentials ?? {});
  if (!exchange) throw new Error("No Lighter client configured (inject one or set globalThis.LIGHTER_CLIENT)");
  const market = await exchange.getMarketPrice(order.asset);
  if (!Number.isFinite(market.price) || market.price <= 0) throw new Error("Lighter returned an invalid market price");
  const round = (value: number, decimals: number) => Number(value.toFixed(decimals));
  const executableOrder = { ...order, quantity: round(order.quantity, market.quantityDecimals ?? 4), price: round(order.price ?? market.price, market.priceDecimals ?? 2) };
  const risk = validateTradeRisk(executableOrder, market.price);
  if (risk.mode === "paper") return { mode: "paper", order: { ...executableOrder, apiKey: "[redacted]" } };
  return exchange.placeOrder(executableOrder);
}
