import { describe, expect, test } from "bun:test";
import { crossedThreshold } from "./price";

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
});
