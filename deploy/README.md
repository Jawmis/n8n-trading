# Deployment

The Compose topology runs MongoDB, the API, the detached executor, and the
client SPA. From the repository root, provide secrets through the environment
or a deployment secret manager and run:

```sh
docker compose -f deploy/docker-compose.yml up --build
```

Set `SIGNUP_INVITATION_CODE` to a high-entropy value in the secret manager;
signup is disabled without a configured invitation. Keep it out of source
control and distribute it only to pilot users. Requests are rate limited using
shared MongoDB counters (10 signup/signin attempts per client IP per 15 minutes;
600 API requests per client IP per 15 minutes). Keep `TRUST_PROXY_HOPS=0` unless
the API is behind a known proxy; set it to the exact number of trusted proxy
hops so client-supplied forwarding headers cannot bypass throttling.
Set a separate high-entropy `TRADING_OPERATOR_TOKEN` to enable the audited
runtime emergency-stop endpoint described in `OPERATIONS.md`.

The API is available on port 3000, the executor probe on port 3001, and the
client on port 80. The client image configures an Nginx SPA fallback so direct
loads of client routes work. Compose pins trading to paper demo mode. It uses
fixed example prices (BTC 100000, ETH 3000, SOL 150) and places no broker
orders; these prices are not market data. Set `TRADING_KILL_SWITCH=true` to
stop further paper actions. Run `bun deploy/smoke.ts` against a disposable
stack to verify signup, publication, scheduling, and a persisted paper trade.
The smoke test creates and removes a workflow; its test account remains in the
disposable database. Provide `SIGNUP_INVITATION_CODE` to the smoke process.

Before upgrading an existing installation, stop the API and executor, take a
backup, and verify that it can be restored. Run
`MONGO_URL=... bun apps/backend/migrate-private-mvp.ts` for dry-run counts, then
`MIGRATION_BACKUP_CONFIRMED=yes MONGO_URL=... bun apps/backend/migrate-private-mvp.ts --apply`.
The apply step pauses every legacy workflow as an unpublished draft, removes
legacy published snapshots and inline node credentials, and fails pending or
running jobs for manual review. Dry-run output separates invalid graphs and
credential references that are missing, revoked, owned by another user, or still
embedded inline. Owners
must inspect each draft, select their own active credential where needed, and
publish a new version before enabling it.

Upgrade the API and executor together after migration. Do not run the old API
or executor against the migrated database. To roll back after applying the
migration, stop both services, restore the verified pre-migration backup, and
then deploy the matching previous API and executor versions. The migration is
idempotent, but restoring the backup is the supported rollback because the
migration deliberately removes inline secrets and holds ambiguous jobs.
