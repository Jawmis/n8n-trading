import { describe, expect, test } from "bun:test";
import { validateEditorNode } from "./editor-validation";

describe("workflow editor validation", () => {
  test("requires a positive timer interval", () => {
    expect(validateEditorNode("timer", { time: 0 })).toContain("greater than zero");
    expect(validateEditorNode("timer", { time: 60 })).toBeNull();
  });

  test("requires a positive trading quantity and credential", () => {
    const metadata = { type: "LONG" as const, symbol: "BTC" as const, qty: 0 };
    expect(validateEditorNode("lighter", metadata)).toContain("credential");
    expect(validateEditorNode("lighter", metadata, "credential-1")).toContain("Quantity");
    expect(validateEditorNode("lighter", { ...metadata, qty: 1 }, "credential-1")).toBeNull();
  });

  test("requires a positive price trigger price", () => {
    expect(validateEditorNode("price-trigger", { asset: "BTC", price: 0, decimals: 0 })).toContain("greater than zero");
    expect(validateEditorNode("price-trigger", { asset: "BTC", price: 100, decimals: 0 })).toBeNull();
  });
});
