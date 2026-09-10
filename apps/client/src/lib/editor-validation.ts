import type { NodeMetadata, NodeKind } from "@/component/CreateWorkflow";
import type { PriceTriggerMetadata, TimerNodeMetadata, TradingMetadata } from "common/types";

export function validateEditorNode(kind: NodeKind, metadata: NodeMetadata, credentialId?: string): string | null {
  const fields = metadata as Partial<TimerNodeMetadata & PriceTriggerMetadata & TradingMetadata>;
  if (kind === "timer") {
    return typeof fields.time === "number" && Number.isFinite(fields.time) && fields.time > 0
      ? null
      : "Timer interval must be greater than zero seconds.";
  }

  if (kind === "price-trigger") {
    if (!fields.asset) return "Select an asset for the price trigger.";
    return typeof fields.price === "number" && Number.isFinite(fields.price) && fields.price > 0
      ? null
      : "Trigger price must be greater than zero.";
  }

  if (!credentialId) return "Select a broker credential.";
  if (fields.type !== "LONG" && fields.type !== "SHORT") return "Select LONG or SHORT.";
  if (!fields.symbol) return "Select a trading symbol.";
  if (typeof fields.qty !== "number" || !Number.isFinite(fields.qty) || fields.qty <= 0) {
    return "Quantity must be greater than zero.";
  }
  if (fields.price !== undefined && (!Number.isFinite(fields.price) || fields.price <= 0)) {
    return "Limit price must be greater than zero.";
  }
  if (fields.leverage !== undefined && (!Number.isFinite(fields.leverage) || fields.leverage <= 0)) {
    return "Leverage must be greater than zero.";
  }
  return null;
}
