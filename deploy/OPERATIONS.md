# Production operations

## Backup and restore

Back up MongoDB before every release and at least daily in production. Store
the archive outside the MongoDB volume and verify restores in an isolated
environment:

```sh
docker compose -f deploy/docker-compose.yml exec mongo \
  mongodump --archive=/tmp/trading.archive --db=trading
docker compose -f deploy/docker-compose.yml cp \
  mongo:/tmp/trading.archive ./backups/trading-$(date +%Y%m%d%H%M%S).archive
```

To restore, stop API and executor consumers, restore into a disposable MongoDB
instance first, verify workflow ownership and execution counts, then restore
the production database during a maintenance window:

```sh
docker compose -f deploy/docker-compose.yml cp ./backups/trading.archive \
  mongo:/tmp/trading.archive
docker compose -f deploy/docker-compose.yml exec mongo \
  mongorestore --drop --archive=/tmp/trading.archive
```

Never commit backup archives or encryption keys. Keep
`CREDENTIAL_ENCRYPTION_KEY` backed up in the deployment secret manager; losing
it makes encrypted broker credentials unrecoverable.

## Legacy workflow migration

Follow the dry-run and apply sequence in `deploy/README.md`. The migration
does not copy inline secrets into credential records: it deletes legacy inline
credentials and published snapshots, pauses workflows, and reports invalid
graphs and credential references. Owners must review each draft, create or
rotate credentials through the credential API, attach their own active
credential IDs, and publish a new version before enabling. Never infer broker
ownership or reconstruct secrets from logs or backups. Keep all migrated
workflows paused until their owners complete that review.

## Execution bounds and shutdown

The executor caps one run at five minutes. Lighter REST requests use a 20
second timeout by default; `LIGHTER_REQUEST_TIMEOUT_MS` can lower this and is
capped at 30 seconds. Lighter transaction submission has the SDK's 10 second
timeout. Compose allows the executor seven minutes to finish its current
bounded request and shut down. An in-flight order with no confirmed response
is held for operator reconciliation and is not submitted again automatically.

## Rollback

Images are immutable and should be tagged with the Git commit SHA. To roll
back, deploy the previous known-good image tags, keep MongoDB at the current
schema-compatible version, verify `/readyz` for API and executor, and run a
paper-mode workflow smoke test before reopening traffic. If a schema migration
is not backward-compatible, restore the database backup from before the
release before starting the old images.

## Alerts

Alert on API or executor readiness failures, `http_request_failures_total`
increases, executor job failures, repeated queue lease recovery, MongoDB
healthcheck failures, and any live-trading order while
`TRADING_KILL_SWITCH=true`. Real-money trading stays disabled until these
alerts are connected to the production monitoring system and exercised.
