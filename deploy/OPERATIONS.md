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

## Legacy credential migration

Before enabling execution for a migrated installation, audit workflow
documents for the legacy nodes[].credentials field. For each affected
workflow, identify the owning user and broker, ask the owner to create or
rotate a credential through the credential API, attach the returned credential
ID to the action node, and verify a paper-mode test. Do not infer a broker or
reconstruct secrets from logs or backups. Keep the workflow disabled until the
owner re-enters an unknown or incomplete secret. After verification, remove the
legacy inline field with a controlled migration script and confirm a workflow
read contains only credential metadata/IDs. Record the count of migrated,
blocked, and manually remediated workflows for the release audit.

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
