# Acceptance tests

## M0 gate

M0 is complete only when:

- one command can start Web, API, PostgreSQL, Redis and MinIO
- Render Worker and Analysis Worker processes start and expose health
- TypeScript strict mode is active
- Ruff, Mypy and Pytest are configured for Python 3.12
- format, lint, typecheck, unit test and build commands pass
- Playwright is configured
- Docker Compose validates and service health checks pass
- CI executes the quality gate
- README, AGENTS and document skeletons exist

## Later milestone test layers

- Unit: time math, media scoring, deduplication, caption splitting, slots, CTA, schema
  validation, migrations, job states and authorization.
- Integration: storage upload, media persistence, queueing, analysis writeback, project
  generation, render writeback and quality reports.
- End-to-end: login, hotel setup, BrandKit, upload, analysis, project creation, edits, render
  and artifact download.
- Golden: normalized project JSON, captions, media selection, track order, duration, CTA and
  sampled rendered frames for all three templates.

Each milestone adds its tests before the next milestone begins.

## M0 verification record

Verified on 2026-07-27:

- all Compose services built and started successfully
- Web returned HTTP 200
- API, Render Worker and Analysis Worker reported ready
- PostgreSQL returned `1` for a live query
- Redis returned `PONG`
- the MinIO bucket initializer completed successfully
- the repository health script passed
- format, lint, typecheck, unit tests, integration tests and builds passed
- Docker WSL virtual disks were stored under the configured D drive data root

## M1 gate

M1 is complete only when:

- all 13 planned entities have PostgreSQL tables and constraints
- the migration succeeds against an empty database
- fictional seed data can be loaded repeatedly
- repositories enforce organization membership on reads and writes
- an authorized user can create a hotel, save its BrandKit and create a VideoBrief
- another tenant receives no resource visibility
- Zod contracts reject invalid input and database checks reject invalid persisted values
- render job transitions are explicit and unit tested
- OpenAPI JSON and interactive documentation are accessible
- Compose applies migrations before starting a database-ready API

## M1 verification record

Verified on 2026-07-27:

- the initial Drizzle migration created 13 public tables in a fresh acceptance database
- the acceptance database recorded one migration and was removed after verification
- the main development database migrated and loaded fictional seed data
- the PostgreSQL/API integration test created a hotel, BrandKit and VideoBrief
- cross-tenant hotel and VideoBrief reads returned 404
- the database rejected a VideoBrief outside the allowed duration range
- OpenAPI 0.1.0 exposed eight paths and the Swagger UI returned HTTP 200
- API readiness reported the PostgreSQL check as `ok`
- all seven long-running Compose services passed the repository health check
- formatting, lint, TypeScript/Python type checks, unit tests, integration tests, builds and the
  Playwright Chromium smoke test passed

## M2 gate

M2 is complete only when:

- an authorized user can create and complete a MinIO multipart video upload
- object size and SHA-256 are validated before analysis is queued
- BullMQ delivers a language-neutral job to the Python worker
- ffprobe metadata, proxy video, thumbnail and extracted audio are persisted
- PySceneDetect scenes and transcript word timestamps/VAD are visible in asset detail
- analysis logs expose the ordered processing stages and terminal state
- a failed or interrupted analysis can be manually retried
- retry replaces automatic results, upserts derivatives and preserves manual tags
- another tenant cannot see the asset or its derivatives
- local mock, disabled and real faster-whisper provider boundaries are available

## M2 verification record

Verified on 2026-07-27:

- migration `0001_numerous_magus.sql` raised the public business schema from 13 to 16 tables;
  the main database records two Drizzle migrations
- a generated 720×1280, 30 fps, 3-second H.264/AAC test video completed a real presigned MinIO
  multipart upload
- the Python BullMQ worker recomputed SHA-256 and marked the asset ready on its first attempt
- asset detail returned duration, resolution, frame rate, video/audio codecs and channel count
- MinIO contained proxy, thumbnail and audio derivatives; the signed thumbnail URL returned
  HTTP 200
- PySceneDetect produced three scene segments and the mock transcriber produced a Chinese
  transcript, two word timestamps, one speech segment and one VAD segment
- structured analysis logs showed download, probe, derivative creation, transcription and
  completion
- after a simulated interrupted state, the retry API created a new job which succeeded; three
  derivative rows remained, five automatic segments were rebuilt and the manual `重点卖点` tag
  survived
- the M2 PostgreSQL/API integration test covers registration, completion, tenant isolation,
  manual tagging, queue payloads and retry
- Python unit tests cover ffprobe normalization, silent-video audio generation and transcription
  provider behavior
- all Compose services reported healthy after rebuilding API and analysis images
