export type PriceDirection = "ABOVE" | "BELOW";

export function crossedThreshold(previous: number, current: number, threshold: number, direction?: PriceDirection) {
  if (![previous, current, threshold].every(Number.isFinite)) return false;
  if (direction === "ABOVE") return previous < threshold && current >= threshold;
  if (direction === "BELOW") return previous > threshold && current <= threshold;
  return (previous < threshold && current >= threshold) || (previous > threshold && current <= threshold);
}
