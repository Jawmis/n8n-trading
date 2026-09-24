# Deployment

The Compose topology runs MongoDB, the API, the detached executor, and the
client SPA. From the repository root, provide secrets through the environment
or a deployment secret manager and run:

```sh
docker compose -f deploy/docker-compose.yml up --build
```

The API is available on port 3000, the executor probe on port 3001, and the
client on port 80. The client image configures an Nginx SPA fallback so direct
loads of client routes work. Compose pins trading to paper demo mode. It uses
fixed example prices (BTC 100000, ETH 3000, SOL 150) and places no broker
orders; these prices are not market data. Set `TRADING_KILL_SWITCH=true` to
stop further paper actions. Run `bun deploy/smoke.ts` against a disposable
stack to verify signup, publication, scheduling, and a persisted paper trade.
The smoke test creates and removes a workflow; its test account remains in the
disposable database.

Before upgrading an existing installation, take and verify a backup. Run
`MONGO_URL=... bun apps/backend/migrate-private-mvp.ts` for dry-run counts, then
`MIGRATION_BACKUP_CONFIRMED=yes MONGO_URL=... bun apps/backend/migrate-private-mvp.ts --apply`.
This pauses legacy workflows and fails legacy in-flight jobs for manual review;
owners must review and publish a new version before re-enabling. Do not run the
migration against an unbacked-up database.
