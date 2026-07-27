# HotelCut

HotelCut is a hotel short-video automation platform. The MVP turns hotel brand configuration,
real-person footage and hotel media into an editable project, a rendered vertical video and a
quality report.

## Milestone status

M0 through M3 were completed and locally accepted on 2026-07-27. The repository now includes:

- pnpm and Turborepo monorepo
- React and Vite web application
- Fastify API
- BullMQ render worker boundary
- Python 3.12 analysis worker boundary
- PostgreSQL, Redis and MinIO development infrastructure
- strict TypeScript and Python quality gates
- Vitest, Pytest and Playwright harnesses
- Docker Compose and GitHub Actions
- the complete M1 PostgreSQL model and Drizzle migration
- fictional, idempotent development seed data
- tenant-scoped PostgreSQL repositories
- Zod request and response contracts
- hotel, BrandKit and VideoBrief APIs
- generated OpenAPI documentation
- presigned MinIO multipart video upload and checksum validation
- BullMQ media-analysis jobs with safe retry
- ffprobe metadata, FFmpeg proxy/thumbnail/audio generation and PySceneDetect scenes
- replaceable faster-whisper transcription with word timestamps and VAD
- tenant-scoped asset detail, derivative download and manual tagging APIs
- renderer-independent `HotelVideoProject` v1 with integer-frame timing
- Zod, TypeScript and generated JSON Schema timeline contracts
- explicit validation errors and a versioned `0.9.0` to `1.0.0` migration
- deterministic template input/output SDK with seeded random and ID generation
- canonical JSON fixtures and an OpenTimelineIO export prototype

## Prerequisites

- Node.js 22
- pnpm 11
- Python 3.12
- Docker Desktop with the WSL 2 backend

Copy `.env.example` to `.env` only when local overrides are needed. The Compose defaults are
safe for local development and must not be used in production.

## One-command start

```bash
pnpm install
pnpm dev
```

`pnpm dev` builds and starts Web, API, Render Worker, Analysis Worker, PostgreSQL, Redis and
MinIO. After the containers are healthy:

- Web: <http://localhost:5173>
- API health: <http://localhost:3000/health>
- API documentation: <http://localhost:3000/docs/>
- Render worker health: <http://localhost:3001/health>
- Analysis worker health: <http://localhost:8001/health>
- MinIO API: <http://localhost:9000>
- MinIO console: <http://localhost:9001>

Verify all services:

```bash
pnpm healthcheck
```

Stop the stack:

```bash
pnpm down
```

For local hot reload, start infrastructure with `pnpm dev:infra` and applications with
`pnpm dev:apps`.

Compose applies migrations and loads fictional development data before starting the API. Local
requests use the seeded development identity until the authentication milestone:

```text
x-user-id: 20000000-0000-4000-8000-000000000001
```

The seeded organization is `云栖酒店集团（演示）`. To manage the database manually:

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

## Quality commands

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm test:e2e
```

The Python commands prefer a repository-local `.venv` and otherwise use Python from `PATH`.
Install the development dependencies:

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -e "apps/analysis-worker[dev]"
```

On Linux or macOS, use `.venv/bin/python`.

## Repository layout

```text
apps/
  web/
  api/
  render-worker/
  analysis-worker/
packages/
  domain/
  schemas/
  database/
  storage/
  media/
  job-queue/
  timeline/
  template-sdk/
infrastructure/
  docker/
  scripts/
docs/
tests/
```

See `packages/README.md` for package ownership.

## Current limitations

- `x-user-id` is a development-only identity boundary; SSO/JWT authentication is not yet
  implemented.
- Local Compose defaults to the deterministic `mock` transcription provider. Set
  `ANALYSIS_TRANSCRIPTION_PROVIDER=faster-whisper` to run the real model; the first run downloads
  the configured model into the persistent Docker model cache.
- M2 detects scenes, speech and VAD ranges. Black-frame, duplicate-fingerprint and waveform
  analysis remain follow-up analysis enhancements.
- The render worker accepts only an M0 healthcheck job; real rendering begins in M6.
- MinIO images use moving development tags and must be pinned before shared staging use.
- OpenCut is documentation and adapter planning only.
- M3 defines template execution contracts but does not yet implement automatic media selection,
  shot planning or the three product templates; those belong to M4.

## M4 readiness

The M3 timeline contract, migration, deterministic template SDK, generated JSON Schema and OTIO
fixture pass locally. M4 may begin as a separate, reviewable milestone.
