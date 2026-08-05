# HotelCut

HotelCut is a hotel short-video automation platform. The MVP turns hotel brand configuration,
real-person footage and hotel media into an editable project, a rendered vertical video and a
quality report.

## Milestone status

M0 through M6 were completed and locally accepted on 2026-07-28. M7 is in progress through
small, reviewable workspace slices, including the production render-delivery center. AI Director
Phase 0 is implemented as an additive, feature-flagged foundation. The repository now includes:

- pnpm and Turborepo monorepo
- React and Vite web application
- Fastify API
- BullMQ render queue with progress, cancellation and retry
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
- deterministic automatic editing with filtering, scoring, deduplication and duration matching
- A-roll speech segmentation, muted B-roll, caption wrapping, CTA timing and music looping
- declarative slot templates for host presentation, room montage and hotel promotion
- generation manifests, per-candidate score records, warnings and explanation logs
- locked-shot regeneration and single-shot replacement
- a pure, validated command editor for shot replacement, source trimming, copy and music changes
- bounded undo and redo history with branch invalidation
- a vertical review preview, scene rail and simplified multi-track timeline
- no-JSON controls for title, caption, CTA and music editing
- debounced autosave backed by immutable project revisions and optimistic concurrency
- tenant-scoped project and revision APIs
- a renderer-neutral adapter and Remotion implementation
- FFmpeg normalization, probing, cover extraction, black-frame and silence detection
- MP4, SRT, cover, normalized project, media manifest and quality-report artifacts
- eleven mandatory output quality checks with success gating
- tenant-scoped render-job, artifact and short-lived download APIs
- a Chromium/FFmpeg render-worker image and full Compose wiring
- fixed-media golden rendering for all three hotel templates
- an explicit development seed-account entry for the M7 Web workspace
- tenant-scoped organization and hotel discovery with search and hotel selection
- scrypt-based email login with an HttpOnly opaque session cookie
- PostgreSQL session revocation and server-derived actor identity on protected routes
- editable hotel details and BrandKit defaults through administrator-scoped production APIs
- production-backed asset upload, analysis monitoring, filtering, preview, retry and manual tags
- production VideoBrief, template selection, deterministic automatic compilation and revision-one
  project preview
- tenant-scoped CreativeProject persistence and API operations
- four AI creation entry modes gated independently from reference analysis, dynamic blueprint and
  AI review rollout
- an additive AI Director data model that preserves the existing Compiler and fixed templates

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

Compose applies migrations and loads fictional development data before starting the API. Sign in
through the Web app with the local-only seed credential:

```text
email: owner@hotelcut.example
password: hotelcut-local
```

Set `ALLOW_DEVELOPMENT_IDENTITY=false` to disable the legacy `x-user-id` integration-test path
and exercise only server-owned sessions.

AI Director rollout is controlled by `AI_DIRECTOR_ENABLED`, `REFERENCE_ANALYSIS_ENABLED`,
`DYNAMIC_BLUEPRINT_ENABLED` and `AI_REVIEW_ENABLED`. See
`docs/ai-director/architecture.md` for the compatibility and validation boundary.

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
pnpm --filter @hotelcut/renderer acceptance:golden
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
  compiler/
  templates/
  editor/
  renderer/
  quality-control/
infrastructure/
  docker/
  scripts/
docs/
tests/
```

See `packages/README.md` for package ownership.

## Current limitations

- Basic email/password sessions are implemented, but self-service signup, password reset, email
  verification, login rate limiting, MFA and enterprise SSO are not yet implemented.
- Local Compose defaults to the deterministic `mock` transcription provider. Set
  `ANALYSIS_TRANSCRIPTION_PROVIDER=faster-whisper` to run the real model; the first run downloads
  the configured model into the persistent Docker model cache.
- M2 detects scenes, speech and VAD ranges. The Analysis Worker can resolve an encrypted per-hotel
  Alibaba Cloud Model Studio or OpenAI setting and send bounded representative frames for
  structured hotel-scene tags, visual quality scoring and selling-point extraction. Without a
  usable key or during provider failure, deterministic and manual-tag editing remains available.
- The M5 preview remains an editorial interpreter; M6 final output is produced independently by
  Remotion and FFmpeg.
- MinIO images use moving development tags and must be pinned before shared staging use.
- OpenCut is documentation and adapter planning only.
- The M7 workspace now authenticates with a server-owned session, selects a tenant-scoped hotel,
  edits its hotel/BrandKit configuration, operates its video asset library and creates
  automatically compiled production projects. Generated and saved projects now open in the full
  Studio, persist later edits as immutable production revisions and can be rendered into
  quality-checked downloadable delivery artifacts.
- Remotion licensing and expected rendering capacity must be reviewed before commercial launch.

## M7 progress

The first M7 slice added tenant-scoped hotel discovery and selection. The second slice adds
email/password verification, revocable PostgreSQL sessions, HttpOnly cookie restoration and
logout, and server-derived identity for all protected APIs. The third slice adds editable hotel
details and BrandKit defaults, preserves existing Logo references until the asset library can
offer an ownership-checked selector, and covers BrandKit cross-tenant reads and writes. The fourth
slice adds the production video asset library with chunked hashing, direct multipart upload,
analysis monitoring, filtering, derivative preview, manual tags and safe retry. The fifth slice
adds a production VideoBrief form, template catalog, Chinese-to-canonical media-tag mapping,
server-side deterministic compilation, revision-one persistence and result preview. Production
Studio persistence is now connected with debounced autosave, manual save, conflict recovery and
same-hotel asset validation. The seventh slice connects render submission, live progress,
cancellation, retry, quality reports and short-lived artifact downloads. Operation audit, Logo
selection and quotas follow.
