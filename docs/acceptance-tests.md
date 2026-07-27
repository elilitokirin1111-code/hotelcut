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

## M3 gate

M3 is complete only when:

- `HotelVideoProject` v1 models video, audio, overlay and caption tracks
- video, image, audio, text and caption clips use integer-frame ranges
- transforms, transitions, safe areas, typed BrandKit tokens and CTA are renderer-independent
- Zod validation reports readable paths for structural and cross-field errors
- inferred TypeScript types and a committed JSON Schema come from the same runtime contract
- a versioned migration converts the `0.9.0` draft into a valid `1.0.0` project
- canonical template input and output schemas are implemented
- the template execution context provides seeded random choices and deterministic UUIDs
- the same input, template version and seed produce byte-equivalent normalized output
- committed JSON and OTIO golden fixtures cannot drift silently
- the OTIO prototype is readable by the official OpenTimelineIO library

## M3 verification record

Verified on 2026-07-27:

- the canonical project fixture validated with four tracks and all five clip kinds
- invalid overlap tests reported `tracks[0].clips[1].startFrame`
- brand-token, safe-area, timing, track compatibility and global ID invariants are enforced
- the committed draft-2020-12 JSON Schema matched the Zod-generated artifact
- the `0.9.0` fixture migrated from 10,000 milliseconds to 300 frames at 30 fps
- two executions of the fixture template produced byte-equivalent normalized projects
- changing only the seed changed deterministic IDs while preserving a valid project
- template errors were classified by input, generation and output stage
- the committed OTIO fixture matched the exporter byte-for-byte
- official OpenTimelineIO 0.18.1 parsed four tracks with a 900-frame duration at 30 fps

## M4 gate

M4 is complete only when:

- compiler input validates analyzed video, image and audio candidates with frame-aligned segments
- non-ready, incompatible, too-short, duplicate and unusably silent candidates are rejected
- every candidate has a deterministic score record with components and rejection reasons
- A-roll uses speech segments and preserves speaking audio
- B-roll and montage clips are muted and placed in declared slots
- Chinese captions wrap and paginate inside a configured safe area
- approved CTA data receives template timing without invented facts
- background music fills the project with deterministic looping and boundary fades
- the same fixed input/template/seed produces byte-equivalent output
- regeneration preserves locked clips and recomputes unlocked clips
- single-shot replacement validates the requested source and leaves other clip IDs unchanged
- every result contains project JSON, manifest, score records, warnings and explanation log
- fixed test media produces the host+B-roll, room montage and hotel promotion templates

## M4 verification record

Verified on 2026-07-27:

- a fixed 13-asset library produced all three valid projects with zero unmet requirements
- host+B-roll produced five tracks, seven manifest slots and per-candidate scoring
- the room montage produced six manifest slots; promotion produced five
- duplicate fingerprints favored the higher-quality source and failed media never won a slot
- A-roll used three distinct speech ranges; B-roll was muted and generated captions were paged
- a 600-frame music source looped to fill the 900-frame host project with edge fades
- changing the seed regenerated unlocked clip IDs while a locked shot retained its ID and asset
- explicit room B-roll replacement changed one asset while all other visual clip IDs remained
- removing promotion media produced `SLOT_REQUIREMENT_UNMET` without fabricating a replacement
- all three complete results matched their committed golden JSON byte-for-byte after stable
  normalization
