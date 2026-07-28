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

## M5 gate

M5 is complete only when:

- a hotel operator can review the project in a vertical preview
- generated scenes and the video, caption, overlay and audio tracks are visible without JSON
- one shot can be replaced while its clip identity and unrelated clips remain unchanged
- video source in/out points can be adjusted without shifting the project timeline
- title, caption and approved CTA copy can be corrected
- background music can be replaced across all loops
- every edit produces another schema-valid `HotelVideoProject`
- undo and redo preserve immutable history and clear redo after a branch edit
- rapid edits are batched into a debounced autosave
- successful saves create immutable, sequential project revisions
- a stale base revision returns conflict instead of overwriting newer work
- project and revision reads remain tenant scoped

## M5 verification record

Verified on 2026-07-28:

- the fictional six-scene hotel project rendered in the Studio preview, scene rail and simplified
  timeline
- the UI replaced a lobby shot, changed a caption and CTA, and exposed source in/out controls
- command tests covered shot replacement, trimming, title, caption, CTA and music changes
- the editor rejected incompatible targets and validated every resulting project
- bounded history tests covered undo, redo and branch invalidation
- Web tests proved caption preview updates and batched trim/CTA autosave to one revision
- API contract tests rejected invalid project documents before repository persistence
- PostgreSQL/API integration created revision 1, saved revision 2 and rejected a stale revision 1
  save with HTTP 409
- another tenant could not read the project or revision history

## M6 gate

M6 is complete only when:

- render requests bind to an immutable project revision and SHA-256 input hash
- BullMQ invokes a real render worker and reports durable progress
- cancellation stops in-flight Remotion/FFmpeg work and queued or failed work is safely retryable
- Remotion renders video, image, audio, text, captions, CTA, BrandKit tokens and transitions
- FFmpeg emits a normalized H.264/AAC 1080 by 1920 MP4 at the project frame rate
- every attempt produces MP4, SRT, cover, project JSON, media manifest and quality report
- ffprobe, duration, audio, caption safe area, missing asset, black, silence and CTA checks run
- a mandatory quality failure cannot produce a successful job
- project state and immutable revisions survive failures unchanged
- job, artifact and download APIs remain tenant scoped
- all three fixed golden projects complete a full-duration real render

## M6 verification record

Verified on 2026-07-28:

- migration `0002_brown_silver_surfer.sql` upgraded the active PostgreSQL database
- OpenAPI exposed render create/list/detail, cancel, retry and artifact-download routes
- database/API integration covered immutable revision binding, cross-tenant 404s, progress,
  quality-gated success, six artifacts, signed download, cancellation and retry
- render-worker tests covered success, quality failure, cancellation and traceable engine failure
  without mutating the project
- fixed synthetic media completed full-duration renders for host+B-roll (30 s), room montage
  (25 s) and promotion (20 s)
- all three outputs were ffprobe-readable H.264/AAC, 1080 by 1920 at 30 fps with audio
- all three received `passed` and 10,000 basis points across eleven mandatory checks
- the same three full-duration renders passed inside the Linux `render-worker` container, using
  its packaged Chromium and FFmpeg; ignored evidence was copied to
  `tmp/m6-linux-acceptance-2026-07-28`
- the render-worker image includes Chromium, FFmpeg and Noto CJK fonts; Compose supplies
  PostgreSQL, Redis and internal MinIO configuration
- the database-enabled integration suite passed all six M1/M2/M5/M6 cases against the active
  PostgreSQL service
- the desktop browser review found no console warnings or layout overlap at 1440 × 1000

## M7 gate

M7 is complete only when:

- tenant permissions protect every hotel workspace operation
- hotel list, configuration, assets, video projects and render center use production APIs
- operation audit and basic quotas are enforced and visible
- another hotel user cannot access assets, projects, render artifacts, BrandKit or upload URLs
- development seed login is replaced or clearly separated from formal basic email authentication

## M7 slice 1 verification record

Verified on 2026-07-28:

- the Web app exposes an explicit local seed-account entry without claiming production auth
- the same-origin `/api` proxy reached the Compose API from the packaged Web container
- organization and hotel responses were schema-validated and requested with the actor header
- the visible hotel list supports name, city and organization search
- selecting a hotel entered a workspace bound to that hotel and organization
- Web typecheck, eight component/client tests and the production build passed
- the browser flow completed login, list, search and selection with no console warnings or errors

## M7 slice 2 verification record

Verified on 2026-07-28:

- scrypt credential tests covered correct, incorrect and malformed password hashes
- opaque 256-bit tokens were stored only as SHA-256 digests in the new `user_sessions` table
- email login issued an HttpOnly, SameSite cookie; protected routes ignored client user IDs when
  the development compatibility path was disabled
- session restoration, anonymous `204` probing, explicit logout revocation and expired-session
  handling were covered by API and Web tests
- migration `0003` applied to the active PostgreSQL service and the database-enabled integration
  suite passed all seven M1/M2/M5/M6/M7 cases
- the rebuilt Compose stack passed every service health check; a real login saw one tenant-scoped
  organization and the revoked cookie received HTTP 401
- format, lint, typecheck, unit tests, integration tests and the production build passed
- the Chromium flow completed email login, hotel selection and workspace entry with no console or
  page errors
