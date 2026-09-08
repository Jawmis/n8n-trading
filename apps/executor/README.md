# Detached workflow executor

The executor polls persisted workflows every two seconds and runs timer-triggered
graphs. Set `MONGO_URL` before starting it.

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run dev
```

Action handlers are injectable. Provide `globalThis.LIGHTER_CLIENT` with
`getMarketPrice` and `placeOrder` implementations to connect a Lighter SDK.
The executor never creates a live exchange client implicitly.

Trading defaults to paper mode. Live trading additionally requires
`TRADING_MODE=live` and `LIVE_TRADING_ENABLED=true`. Configure
`TRADING_KILL_SWITCH`, `ALLOWED_TRADING_ASSETS`, `MAX_ORDER_QUANTITY`, and
`MAX_ORDER_NOTIONAL` before enabling live orders; missing or invalid limits
fail closed.

Price triggers require an injected `globalThis.PRICE_FEED` implementing
`getPrice(asset)`. The executor records a pending price-trigger execution only
when a threshold is crossed; missing or failing feeds do not trigger orders.
