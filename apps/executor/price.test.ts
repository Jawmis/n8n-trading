import { describe, expect, test } from "bun:test";
import { crossedThreshold, freshPrice } from "./price";

describe("price trigger crossing", () => {
  test("fires once when crossing upward and downward", () => {
    expect(crossedThreshold(99, 100, 100)).toBe(true);
    expect(crossedThreshold(100, 101, 100)).toBe(false);
    expect(crossedThreshold(101, 100, 100)).toBe(true);
  });
  test("respects direction", () => {
    expect(crossedThreshold(99, 100, 100, "ABOVE")).toBe(true);
    expect(crossedThreshold(101, 100, 100, "ABOVE")).toBe(false);
    expect(crossedThreshold(101, 100, 100, "BELOW")).toBe(true);
  });
  test("fails safely for invalid prices", () => expect(crossedThreshold(99, Number.NaN, 100)).toBe(false));
  test("rejects stale, future, and invalid quotes", () => {
    expect(freshPrice({ price: 100, timestamp: 90_000 }, 100_000, 5_000)).toBeNull();
    expect(freshPrice({ price: 100, timestamp: 101_000 }, 100_000, 5_000)).toBeNull();
    expect(freshPrice({ price: 0, timestamp: 99_000 }, 100_000, 5_000)).toBeNull();
    expect(freshPrice({ price: 100, timestamp: 99_000 }, 100_000, 5_000)).toEqual({ price: 100, timestamp: 99_000 });
  });
});
