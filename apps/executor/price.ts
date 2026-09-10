export type PriceDirection = "ABOVE" | "BELOW";

export type PriceQuote = number | { price: number; timestamp?: number };

export function freshPrice(quote: PriceQuote, now = Date.now(), maxAgeMs = 30_000) {
  const price = typeof quote === "number" ? quote : quote.price;
  const timestamp = typeof quote === "number" ? now : quote.timestamp ?? now;
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(timestamp)) return null;
  if (timestamp > now || now - timestamp > maxAgeMs) return null;
  return { price, timestamp };
}

export function crossedThreshold(previous: number, current: number, threshold: number, direction?: PriceDirection) {
  if (![previous, current, threshold].every(Number.isFinite)) return false;
  if (direction === "ABOVE") return previous < threshold && current >= threshold;
  if (direction === "BELOW") return previous > threshold && current <= threshold;
  return (previous < threshold && current >= threshold) || (previous > threshold && current <= threshold);
}
