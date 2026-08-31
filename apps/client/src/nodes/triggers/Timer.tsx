import { Handle, Position } from "@xyflow/react";
import type { TimerNodeMetadata } from "common/types";


export function Timer({ data }: {
    data: {
        metadata : TimerNodeMetadata
    },
}) {
    return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Timer Trigger</div>
        <div className="mt-2 text-sm font-medium text-slate-800">Every {data.metadata.time / 3600} seconds</div>
       <Handle type="source" position={Position.Right}></Handle>
   </div> 
}
