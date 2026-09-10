import { describe, expect, test } from "bun:test";
import { timerIsDue } from "./index";

describe("timer trigger scheduling", () => {
  test("runs immediately when there is no prior execution", () => {
    expect(timerIsDue(null, 60, 100_000)).toBe(true);
  });

  test("uses seconds consistently and rejects invalid intervals", () => {
    expect(timerIsDue({ startTime: new Date(40_000) }, 60, 100_000)).toBe(true);
    expect(timerIsDue({ startTime: new Date(41_000) }, 60, 100_000)).toBe(false);
    expect(timerIsDue({ startTime: new Date(40_000) }, 0, 100_000)).toBe(false);
  });
});
