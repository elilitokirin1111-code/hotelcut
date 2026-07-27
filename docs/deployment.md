# Deployment

## Local development

Docker Compose starts Web, API, Render Worker, Analysis Worker, PostgreSQL, Redis and MinIO.
Named volumes preserve local infrastructure data.

```bash
pnpm install
pnpm dev
pnpm healthcheck
```

Docker Desktop uses the WSL 2 backend on Windows.

## Production direction

Production deployment is not implemented in M0. The intended separation is:

- stateless Web and API services
- independently scalable analysis and render workers
- managed PostgreSQL and Redis
- S3-compatible object storage
- per-service health, resource and queue-depth monitoring

Production work must pin container digests, use secret management, define backup and retention
policies, enforce TLS and execute data-isolation tests.
