// This is where all the metadata for both the backend and the frontend is stored.

export const SUPPORTED_ASSETS = ["SOL", "BTC", "ETH"];

export type TimerNodeMetadata = {
    time: number;
};

export type TradingMetadata = {
    type: "LONG" | "SHORT",
    qty: number,
    symbol: (typeof SUPPORTED_ASSETS)[number],
    leverage?: number,
    price?: number,
    reduceOnly?: boolean,
};

export type PriceTriggerMetadata = {
    asset: string,
    price: number,
    decimals : number
    
};
