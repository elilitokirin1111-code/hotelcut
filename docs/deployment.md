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

To enable production footage understanding, open **Settings → 大模型 API 配置**, select Alibaba
Cloud Model Studio, keep the region-matched workspace Base URL, choose `qwen3.7-plus`, paste the
API key and run the minimal connection test. The server encrypts the key with
`MODEL_API_CONFIG_SECRET`; API responses return only a redacted hint. New uploads and manual
analysis retries resolve the latest hotel setting without restarting the worker. Environment
level `OPENAI_API_KEY` remains available as a legacy fallback. With no usable key, the complete
deterministic/manual fallback stays operational.

The render worker uses a dedicated Debian image with Chromium, FFmpeg and Noto CJK fonts.
Compose passes the internal MinIO endpoint so Remotion and FFmpeg can consume presigned assets
inside the Docker network. `RENDER_WORKER_CONCURRENCY` controls parallel jobs, while
`RENDER_CONCURRENCY` controls per-job Remotion frame concurrency.

## Production direction

Production deployment is not implemented through M6. The intended separation is:

- stateless Web and API services
- independently scalable analysis and render workers
- outbound model-provider access and encrypted per-hotel secrets for multimodal analysis workers
- managed PostgreSQL and Redis
- S3-compatible object storage
- per-service health, resource and queue-depth monitoring

Production work must pin container digests, use secret management, define backup and retention
policies, enforce TLS and execute data-isolation tests.
