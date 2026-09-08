# Deployment

The Compose topology runs MongoDB, the API, the detached executor, and the
client SPA. From the repository root, provide secrets through the environment
or a deployment secret manager and run:

```sh
docker compose -f deploy/docker-compose.yml up --build
```

The API is available on port 3000, the executor probe on port 3001, and the
client on port 80. The client image configures an Nginx SPA fallback so direct
loads of client routes work. Compose defaults the executor to paper mode with
the kill switch enabled; do not enable live mode until all P0 trading issues
are complete. MongoDB backups and restore verification must be configured by
the deployment environment before production use.
