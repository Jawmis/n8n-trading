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
