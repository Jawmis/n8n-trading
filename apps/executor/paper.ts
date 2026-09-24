export const PAPER_REFERENCE_PRICES = { BTC: 100_000, ETH: 3_000, SOL: 150 } as const;

export function paperReferencePrice(asset: string) {
  const price = PAPER_REFERENCE_PRICES[asset as keyof typeof PAPER_REFERENCE_PRICES];
  if (!Number.isFinite(price) || price <= 0) throw new Error(`No paper reference price for ${asset}`);
  return price;
}
