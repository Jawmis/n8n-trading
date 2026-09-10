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

The executor includes a signed Lighter adapter backed by `lighter-ts-sdk`.
Credential secrets must contain `apiKey` (the Lighter API private key),
`accountIndex`, and `apiIndex`. Set `LIGHTER_NETWORK` (default `mainnet`) or
`LIGHTER_API_URL` before starting the executor. The adapter resolves market
indices and precision from Lighter, signs orders with the SDK WASM signer, and
requires a transaction hash before reporting success. `globalThis.LIGHTER_CLIENT`
remains available for deterministic tests and paper-mode integrations.

Trading defaults to paper mode. Live trading additionally requires
`TRADING_MODE=live` and `LIVE_TRADING_ENABLED=true`. Configure
`TRADING_KILL_SWITCH`, `ALLOWED_TRADING_ASSETS`, `MAX_ORDER_QUANTITY`, and
`MAX_ORDER_NOTIONAL`, `MAX_ORDER_LEVERAGE`, and `MAX_ORDER_SLIPPAGE_BPS` before
enabling live orders; missing or invalid limits fail closed. Live orders also
require `TRADING_MODE=live`, `LIVE_TRADING_ENABLED=true`, and a credential
private key.

Price triggers require an injected `globalThis.PRICE_FEED` implementing
`getPrice(asset)`. The executor records a pending price-trigger execution only
when a threshold is crossed; missing or failing feeds do not trigger orders.
