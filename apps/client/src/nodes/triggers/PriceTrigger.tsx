import { Handle, Position } from "@xyflow/react";
import { type PriceTriggerMetadata } from "common/types";


export function PriceTrigger({ data }: {
    data: {
        metadata : PriceTriggerMetadata
    },
}) {
    return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Price Trigger</div>
        <div className="mt-2 text-sm font-medium text-slate-800">{data.metadata.asset}</div>
        <div className="text-sm text-slate-600">Price: {data.metadata.price}</div>
       <Handle type="source" position={Position.Right}></Handle>
   </div> 
}
