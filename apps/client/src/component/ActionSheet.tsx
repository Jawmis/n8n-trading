import type { NodeKind, NodeMetadata } from "./CreateWorkflow";
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetFooter,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";

import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { useState } from "react";
import { SUPPORTED_ASSETS } from "common/types";





const SUPPORTED_ACTIONS = [{
    id: "hyperliquid",
    title: "HyperLiquid",
    description: "Place a trade on hyperliquid."
}, {
    id: "lighter",
    title: "Lighter",
    description: "Place a trade on Lighter."
}, {
    id: "backpack",
    title: "Backpack",
    description: "Place a trade on Backpack."
}]

export const ActionSheet = ({
    onSelect,
    onClose
}: {
    onSelect: (kind: NodeKind, metadata: NodeMetadata) => void,
    onClose?: () => void
}
) => {
    // creating a state variable 
    const [metadeta, setMetadata] = useState<any>({});
    const [selectedAction, setSelectedAction] = useState(SUPPORTED_ACTIONS[0].id);
    return <Sheet open={true} onOpenChange={(open) => {
        if (!open) onClose?.();
    }}>

        <SheetContent className="sm:max-w-md">
            <SheetHeader>
                <SheetTitle className="text-xl font-semibold">Select Action</SheetTitle>
                <SheetDescription className="text-sm text-muted-foreground">
                    Pick the action type and configure the trade details.
                </SheetDescription>
            </SheetHeader>
            <div className="mt-6 space-y-4">
                <div className="space-y-2">
                    <div className="text-sm font-medium">Action Type</div>
                    <Select value={selectedAction} onValueChange={(value) => setSelectedAction(value)}>
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Trigger" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectGroup>
                                {SUPPORTED_ACTIONS.map(({ id, title }) => <>
                                    <SelectItem key={id} value={id}>{title}</SelectItem>
                                    {/* <SelectLabel>{description}</SelectLabel> */}
                                </>)}
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                </div>
                {(selectedAction === "hyperliquid" || selectedAction === "lighter" || selectedAction === "backpack") && <div className="space-y-4 rounded-lg border border-border p-4">
                    <div className="space-y-2">
                        <div className="text-sm font-medium">Type</div>
                        <Select value={metadeta.asset} onValueChange={(value) => setMetadata((metadeta: any) => ({
                                    ...metadeta,
                                    type: value
                        }))}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select an asset." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>

                                        <SelectItem  value={"LONG"}>LONG</SelectItem>
                                        <SelectItem  value={"SHORT"}>SHORT</SelectItem>

                                 
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </div>
                    
                    <div className="space-y-2">
                        <div className="text-sm font-medium">Symbol</div>
                        <Select value={metadeta?.symbol} onValueChange={(value) => setMetadata((metadeta: any) => ({
                                    ...metadeta,
                                    symbol: value
                        }))}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select an asset(symbol)." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    {SUPPORTED_ASSETS.map(asset => <SelectItem key={asset} value={asset}>{asset}
                                    </SelectItem>)
                                    }

                                 
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <div className="text-sm font-medium">Qty</div>
                        <Input value={metadeta.time} onChange={(e) => setMetadata((metadeta: any) => ({
                            ...metadeta,
                            qty : Number(e.target.value)
                        }))}></Input>
                    </div>
                </div>
                }
            </div>
            <SheetFooter className="mt-6">
                <Button onClick={() => {
                    onSelect(
                        selectedAction as NodeKind,
                        metadeta as NodeMetadata
                    )
                }} type="submit" className="w-full">Create Action</Button>

            </SheetFooter>
        </SheetContent>
    </Sheet>
 
}
