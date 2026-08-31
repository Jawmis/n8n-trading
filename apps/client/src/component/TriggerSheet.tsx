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





const SUPPORTED_TRIGGERS = [{
    id: "timer",
    title: "Timer",
    description: "Run this trigger every x seconds/minutes."
}, {
    id: "price-trigger",
    title: "Price Trigger",
    description: "Runs whenever the price goes above or below a specific price level for an asset."
}]


export const TriggerSheet = ({
    onSelect
}: {
    onSelect: (kind: NodeKind, metadata: NodeMetadata) => void
}
) => {
    // creating a state variable 
    const [metadeta, setMetadata] = useState<any>({
        time: 3600
    });
    const [selectedTrigger, setSelectedTrigger] = useState(SUPPORTED_TRIGGERS[0].id);
    return <Sheet open={true}>

        <SheetContent className="sm:max-w-md">
            <SheetHeader>
                <SheetTitle className="text-xl font-semibold">Select Trigger</SheetTitle>
                <SheetDescription className="text-sm text-muted-foreground">
                    Choose the trigger type and fill in the details below.
                </SheetDescription>
            </SheetHeader>
            <div className="mt-6 space-y-4">
                <div className="space-y-2">
                    <div className="text-sm font-medium">Trigger Type</div>
                    <Select value={selectedTrigger} onValueChange={(value) => setSelectedTrigger(value)}>
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Trigger" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectGroup>
                                {SUPPORTED_TRIGGERS.map(({ id, title }) => <>
                                    <SelectItem key={id} value={id}>{title}</SelectItem>
                                    {/* <SelectLabel>{description}</SelectLabel> */}
                                </>)}
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                </div>
                {selectedTrigger === "timer" && <div className="space-y-2 rounded-lg border border-border p-4">
                    <div className="text-sm font-medium">Number of seconds</div>
                     <Input value={metadeta.time} onChange={(e) => setMetadata((metadeta: any) => ({
                            ...metadeta,
                            time : Number(e.target.value)
                        }))}></Input>
                </div>
                }
                {selectedTrigger === "price-trigger" && <div className="space-y-4 rounded-lg border border-border p-4">
                    <div className="space-y-2">
                        <div className="text-sm font-medium">Price</div>
                        <Input type="text" onChange={(e) => setMetadata((m: any) => ({
                            ...m,
                            price: Number(e.target.value)
                        }))}></Input>
                    </div>
                    <div className="space-y-2">
                        <div className="text-sm font-medium">Asset</div>
                        <Select value={metadeta.asset} onValueChange={(value) => setMetadata((metadeta: any) => ({
                            ...metadeta,
                            asset: value
                        }))}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select an asset." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    {SUPPORTED_ASSETS.map((id) => <>
                                        <SelectItem key={id} value={id}>{id}</SelectItem>

                                    </>)}
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                    </div>
                </div>}
            </div>
            <SheetFooter className="mt-6">
                <Button onClick={() => {
                    onSelect(
                        selectedTrigger as NodeKind,
                        metadeta as NodeMetadata
                    )
                }} type="submit" className="w-full">Create Trigger</Button>

            </SheetFooter>
        </SheetContent>
    </Sheet>

}
