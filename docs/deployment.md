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

The accepted Windows development machine keeps Docker Desktop and its WSL data under
`D:\HotelCut`. The local analysis worker defaults to deterministic mock transcription. To run
the real model, set `ANALYSIS_TRANSCRIPTION_PROVIDER=faster-whisper`; model files persist in the
`whisper-cache` volume.

To enable production footage understanding, copy `.env.example` to `.env`, set
`OPENAI_API_KEY`, and restart the Analysis Worker. Keep the key only in environment/secret
management; never place it in source code, browser configuration or committed files. The worker
health payload reports `vision=configured` without exposing the key. Tune cost and latency with
`OPENAI_VISION_MODEL`, `OPENAI_VISION_DETAIL`, `OPENAI_VISION_MAX_FRAMES`, timeout and retry
settings. Leaving the key empty keeps the complete deterministic/manual fallback operational.

The render worker uses a dedicated Debian image with Chromium, FFmpeg and Noto CJK fonts.
Compose passes the internal MinIO endpoint so Remotion and FFmpeg can consume presigned assets
inside the Docker network. `RENDER_WORKER_CONCURRENCY` controls parallel jobs, while
`RENDER_CONCURRENCY` controls per-job Remotion frame concurrency.

## Production direction

Production deployment is not implemented through M6. The intended separation is:

- stateless Web and API services
- independently scalable analysis and render workers
- outbound OpenAI access and encrypted secret injection for multimodal analysis workers
- managed PostgreSQL and Redis
- S3-compatible object storage
- per-service health, resource and queue-depth monitoring

Production work must pin container digests, use secret management, define backup and retention
policies, enforce TLS and execute data-isolation tests.
