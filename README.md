# n8n-trading

A visual trading-workflow builder with a React Flow editor, an Express API, MongoDB persistence, and a detached Bun executor. Workflows connect timer triggers, conditions, risk controls, and broker actions; the UI shows execution history and node results.

The default deployment runs **paper mode** with fixed illustrative prices. It does not send broker orders. There is no public live demo.

## Architecture

| Path | Responsibility |
| --- | --- |
| `apps/client` | React 19 / TypeScript workflow editor and execution history |
| `apps/backend` | Express API for auth, workflow validation, publishing, credentials, and execution requests |
| `apps/executor` | Bun service that polls for jobs, executes graphs, and records results |
| `packages/common` | Typed workflow graph and validation contracts |
| `packages/db` | Mongoose models and encrypted credential storage |
| `deploy` | Docker Compose paper-mode deployment |

The graph validator rejects cycles and invalid connections. The executor tracks incoming dependencies and runs a node after its parents complete. **Ready nodes execute sequentially within one workflow**; independent branches are not parallelized. Up to ten separate jobs may be active in the polling service. Execution state and node results are persisted in MongoDB, with leases and timeouts to stop stale work.

## Run the paper-mode stack

Set `JWT_SECRET` and `CREDENTIAL_ENCRYPTION_KEY` before running Docker Compose. The encryption key must be a base64-encoded 32-byte value. For example, generate one with `openssl rand -base64 32` and keep it outside the repository.

```sh
JWT_SECRET=your-long-random-secret \
CREDENTIAL_ENCRYPTION_KEY=your-base64-key \
docker compose -f deploy/docker-compose.yml up --build
```

Open `http://localhost` for the client. The API listens on `http://localhost:3000`; the executor health endpoint uses port 3001. The Compose file pins paper mode and starts MongoDB, API, executor, and client together. For local development without Docker, install with `bun install`, then run the client, backend, and executor workspace scripts with a MongoDB instance and the required environment variables.

## Safety and current limits

- Paper mode uses fixed demo reference prices (BTC 100000, ETH 3000, SOL 150). They are not market data or evidence of trading performance.
- Live trading is separately gated by `TRADING_MODE=live`, `LIVE_TRADING_ENABLED=true`, credentials, and risk limits. See [`apps/executor/README.md`](apps/executor/README.md) before considering it.
- Price-trigger workflows need an injected market-data feed; they are unavailable by default.
- The project does not claim hours saved, faster branches, or production latency. Such claims require measured production data and a reproducible benchmark.

## Engineering checks

```sh
bun run build --filter=client
bun run check-types
bun run test
```
