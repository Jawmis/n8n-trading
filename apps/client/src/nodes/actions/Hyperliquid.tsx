import { Handle, Position } from "@xyflow/react";
import { type TradingMetadata } from "common/types";



export function HyperLiquid({ data }: {
    data: {
        metadata : TradingMetadata
    }
}) {
    return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hyperliquid</div>
        <div className="mt-2 text-sm font-medium text-slate-800">{data.metadata.type}</div>
        <div className="text-sm text-slate-600">Qty: {data.metadata.qty}</div>
        <div className="text-sm text-slate-600">Symbol: {data.metadata.symbol}</div>
        <Handle type="source" position={Position.Right}></Handle>
        <Handle type="target" position={Position.Left}></Handle>

    </div>
}