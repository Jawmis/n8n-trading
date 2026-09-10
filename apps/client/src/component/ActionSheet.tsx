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
import { useEffect, useState } from "react";
import { SUPPORTED_ASSETS } from "common/types";
import type { PriceTriggerMetadata, TimerNodeMetadata, TradingMetadata } from "common/types";
import { apiListCredentials, type Credential } from "@/lib/http";





const SUPPORTED_ACTIONS = [{
    id: "lighter",
    title: "Lighter",
    description: "Place a trade on Lighter."
}];

export const ActionSheet = ({
    onSelect,
    onClose,
    initialMetadata,
    initialCredentialId,
}: {
    onSelect: (kind: NodeKind, metadata: NodeMetadata, credentialId?: string) => void,
    onClose?: () => void,
    initialMetadata?: Partial<TradingMetadata & PriceTriggerMetadata & TimerNodeMetadata>,
    initialCredentialId?: string,
}
) => {
    const [metadeta, setMetadata] = useState<Partial<TradingMetadata & PriceTriggerMetadata & TimerNodeMetadata>>(initialMetadata ?? {});
    const [selectedAction, setSelectedAction] = useState(SUPPORTED_ACTIONS[0].id);
    const [credentials, setCredentials] = useState<Credential[]>([]);
    const [selectedCredentialId, setSelectedCredentialId] = useState<string | undefined>(initialCredentialId);
    useEffect(() => {
        apiListCredentials().then(setCredentials).catch(() => setCredentials([]));
    }, []);
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
                {selectedAction === "lighter" && <div className="space-y-4 rounded-lg border border-border p-4">
                    <div className="space-y-2">
                        <div className="text-sm font-medium">Credential</div>
                        <Select value={selectedCredentialId} onValueChange={setSelectedCredentialId}>
                            <SelectTrigger className="w-full"><SelectValue placeholder="Select a broker credential" /></SelectTrigger>
                            <SelectContent><SelectGroup>{credentials.filter((credential) => credential.provider === selectedAction && !credential.revokedAt).map((credential) => <SelectItem key={credential._id} value={credential._id}>{credential.provider} · {credential._id.slice(-6)}</SelectItem>)}</SelectGroup></SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <div className="text-sm font-medium">Type</div>
                        <Select value={metadeta.asset} onValueChange={(value) => setMetadata((metadeta) => ({
                                    ...metadeta,
                                    type: value as TradingMetadata["type"]
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
                        <Select value={metadeta?.symbol} onValueChange={(value) => setMetadata((metadeta) => ({
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
                        <Input type="number" min="0" value={metadeta.qty ?? ""} onChange={(e) => setMetadata((metadeta) => ({
                            ...metadeta,
                            qty : Number(e.target.value)
                        }))}></Input>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <div className="text-sm font-medium">Limit price (optional)</div>
                            <Input type="number" min="0" value={metadeta.price ?? ""} onChange={(e) => setMetadata((current) => ({ ...current, price: e.target.value ? Number(e.target.value) : undefined }))} />
                        </div>
                        <div className="space-y-2">
                            <div className="text-sm font-medium">Leverage (optional)</div>
                            <Input type="number" min="0" step="0.1" value={metadeta.leverage ?? ""} onChange={(e) => setMetadata((current) => ({ ...current, leverage: e.target.value ? Number(e.target.value) : undefined }))} />
                        </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={metadeta.reduceOnly === true} onChange={(e) => setMetadata((current) => ({ ...current, reduceOnly: e.target.checked }))} />
                        Reduce-only order
                    </label>
                </div>
                }
            </div>
            <SheetFooter className="mt-6">
                <Button onClick={() => {
                    onSelect(
                        selectedAction as NodeKind,
                        metadeta as NodeMetadata,
                        selectedCredentialId,
                    )
                }} type="submit" disabled={!selectedCredentialId} className="w-full">Create Action</Button>

            </SheetFooter>
        </SheetContent>
    </Sheet>
 
}
