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

## Private account onboarding and recovery

The pilot is invite-only. Set `SIGNUP_INVITATION_CODE` in the deployment
secret manager and share it through a separate trusted channel. Signup is
closed when the value is absent. Signin and signup are limited to 10 requests
per source IP in a 15 minute window; other API requests are limited to 600.
Counters are stored in MongoDB so limits apply across API replicas. The API
does not trust forwarded client IP headers by default. Configure
`TRUST_PROXY_HOPS` only for a known proxy chain.

Browser access tokens are held in `sessionStorage`, so closing the tab ends the
browser session. They remain readable by same-origin JavaScript; deploy a
strict content security policy and avoid untrusted scripts. API authentication
uses bearer tokens, so CSRF protections are not needed unless the app moves to
cookies. Expired or revoked tokens clear the session and return the user to
sign in.

For a verified recovery request, take a database backup, deliver a one-time
password to the account owner over a separate trusted channel, and run the
recovery command using secret-manager injected values:

```sh
cd apps/backend && MONGO_URL=... RECOVERY_USERNAME=... RECOVERY_PASSWORD=... bun run recover:account
```

The command hashes the new password and increments the account token version,
revoking all existing sessions. Never put recovery values in shell history,
logs, issue trackers, or chat; inject them through the deployment secret
manager in a restricted maintenance session.

## Execution bounds and shutdown

The executor caps one run at five minutes. Lighter REST requests use a 20
second timeout by default; `LIGHTER_REQUEST_TIMEOUT_MS` can lower this and is
capped at 30 seconds. Lighter transaction submission has the SDK's 10 second
timeout. Compose allows the executor seven minutes to finish its current
bounded request and shut down. An in-flight order with no confirmed response
is held for operator reconciliation and is not submitted again automatically.

## Emergency stop

Keep a high-entropy `TRADING_OPERATOR_TOKEN` in the secret manager. An operator
can activate the shared MongoDB stop without restarting services:

```sh
curl --fail-with-body -X POST http://127.0.0.1:3000/operator/trading/kill-switch \
  -H "Authorization: Bearer $TRADING_OPERATOR_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"enabled":true,"reason":"Operator emergency stop"}'
```

The executor checks the shared stop before each action; the API records each
change in `RuntimeAudits`. Confirm the dashboard shows “Emergency stop is
active.” Before resuming, reconcile any uncertain broker submissions, resolve
the incident, and use the same endpoint with `enabled:false` and a recorded
reason. The environment `TRADING_KILL_SWITCH=true` remains a static emergency
override and cannot be cleared through the API.

Live trading must remain disabled unless both `MAX_POSITION_NOTIONAL` and
`MAX_ORDERS_PER_MINUTE` are positive. The executor enforces the order-frequency
limit atomically per Lighter account and checks the configured position limit
against the broker's current position for that asset. These controls do not
yet reserve aggregate exposure atomically across assets or workflows; keep
real-money trading disabled until that account-wide control is implemented and
verified.

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
