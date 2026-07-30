# Implementation decisions

## ID-001: Isolated repository inside the operations workspace

- Date: 2026-07-27
- Status: accepted
- Decision: create `hotelcut/` as a standalone repository under the existing multi-project
  operations directory.
- Reason: the parent directory contains unrelated projects and is not an empty repository.
- Impact: HotelCut tooling and Git history cannot affect sibling projects.

## ID-002: Create shared packages only in their owning milestone

- Date: 2026-07-27
- Status: accepted
- Decision: M0 creates the package boundary and ownership map but no empty domain packages.
- Reason: empty or fabricated implementations obscure milestone status.
- Impact: M1 and later create packages together with tested contracts.

## ID-003: Health boundaries before business dependencies

- Date: 2026-07-27
- Status: accepted
- Decision: M0 API readiness verifies the process, the analysis worker verifies Redis, and the
  render worker exposes BullMQ connection state.
- Reason: database repositories and domain persistence belong to M1.
- Impact: API dependency readiness expands in M1.

## ID-004: Docker Desktop program and WSL data on D drive

- Date: 2026-07-27
- Status: accepted
- Decision: install Docker Desktop at `D:\HotelCut\DockerDesktop` and configure its WSL data root
  as `D:\HotelCut\DockerData\wsl`.
- Reason: the user explicitly requested Docker installation and data placement on D.
- Impact: Windows optional features must be enabled and the first WSL engine initialization may
  require a system restart.

## ID-005: Moving MinIO tags are local-only

- Date: 2026-07-27
- Status: temporary
- Decision: use official `latest` MinIO server and client tags for the local M0 stack.
- Reason: M0 has no production environment, and the official images simplify first boot.
- Impact: pin image digests before any shared staging deployment.

## ID-006: BullMQ queue names use hyphens

- Date: 2026-07-27
- Status: accepted
- Decision: use `hotelcut-render` as the initial render queue name.
- Reason: BullMQ rejects queue names containing colons.
- Impact: future queue names follow the same hyphenated convention and are covered by contract
  tests.

## ID-007: Tenant scope is enforced by repository queries

- Date: 2026-07-27
- Status: accepted
- Decision: join every tenant-owned read to membership and require owner or admin membership for
  hotel and BrandKit administration.
- Reason: route-only authorization can be bypassed by future workers or internal callers.
- Impact: unauthorized and cross-tenant resource access returns the same not-found result and
  does not disclose existence.

## ID-008: BrandKit is one-to-one with Hotel

- Date: 2026-07-27
- Status: accepted
- Decision: store `hotel_id` as a unique BrandKit foreign key. Keep `logo_asset_id` nullable and
  unenforced until the M2 asset lifecycle is active.
- Reason: this avoids a cyclic Hotel/BrandKit dependency and permits brand setup before uploads.
- Impact: M2 must validate logo ownership before assigning the soft reference and may add the
  database foreign key in a follow-up migration.

## ID-009: Development identity is explicit and local-only

- Date: 2026-07-27
- Status: temporary
- Decision: M1 accepts a UUID in the `x-user-id` header and seeds one fictional owner.
- Reason: persistence and tenant isolation can be completed without pulling SSO/JWT work into M1.
- Impact: the header must not be treated as production authentication and will be replaced by
  verified identity middleware in the authentication milestone.

## ID-010: Compose bootstraps persistence before API startup

- Date: 2026-07-27
- Status: accepted
- Decision: an idempotent `db-bootstrap` service applies Drizzle migrations and optionally loads
  fictional development data before the API starts.
- Reason: one-command development startup must work from an empty volume.
- Impact: production deployment will run migrations as a controlled release job and disable
  development seed data.

## ID-011: Clients upload media directly with presigned multipart URLs

- Date: 2026-07-27
- Status: accepted
- Decision: the API registers an asset and creates a short-lived S3-compatible multipart upload;
  clients upload parts directly to object storage and submit ordered ETags for completion.
- Reason: large hotel footage must not be buffered through the API process.
- Impact: the API validates tenant access, part completeness, object size and registered
  checksum metadata before publishing analysis.

## ID-012: Analysis is a language-neutral BullMQ contract

- Date: 2026-07-27
- Status: accepted
- Decision: the Node API publishes a versioned `m2-v1` payload to `hotelcut-analysis`, and the
  Python BullMQ worker validates it with Pydantic.
- Reason: media tooling is strongest in Python while API and tenant orchestration remain in
  TypeScript.
- Impact: payload changes require a new pipeline version and contract tests.

## ID-013: Local transcription is deterministic by default

- Date: 2026-07-27
- Status: accepted
- Decision: Compose defaults to a mock provider; `faster-whisper` and `disabled` are explicit
  runtime selections.
- Reason: a default developer boot must not download model weights, while production-compatible
  word timestamps and VAD must remain implemented and selectable.
- Impact: acceptance uses the deterministic provider; model-level accuracy evaluation is a
  separate test track.

## ID-014: Media retries preserve human work

- Date: 2026-07-27
- Status: accepted
- Decision: retries use deterministic derivative keys, upsert derivative rows, replace only
  automatic segments and preserve manual segments.
- Reason: interrupted analysis must be safe to repeat without duplicating machine results or
  deleting operator annotations.
- Impact: new automatically generated data must always be marked `source=automatic`.

## ID-015: Timeline time is represented in integer frames

- Date: 2026-07-27
- Status: accepted
- Decision: `HotelVideoProject` uses one integer frame rate and integer start/duration/source
  ranges everywhere.
- Reason: frame arithmetic is deterministic and removes floating-point second ambiguity at
  renderer and exchange boundaries.
- Impact: external millisecond or second inputs must be rounded once during import or migration.

## ID-016: Timeline clips are renderer-independent discriminated types

- Date: 2026-07-27
- Status: accepted
- Decision: model video, image, audio, text and caption clips as a Zod discriminated union with
  normalized transforms, safe-area references and typed BrandKit token references.
- Reason: project revisions must remain editable and portable without importing Remotion, FFmpeg
  or OpenCut types.
- Impact: renderer adapters translate the canonical model and cannot extend persisted documents
  with private runtime objects.

## ID-017: Template variability comes only from a seeded execution context

- Date: 2026-07-27
- Status: accepted
- Decision: the template SDK supplies deterministic random, integer, pick, UUID and input-hash
  functions scoped by template ID, semantic version and unsigned seed.
- Reason: identical business input must reproduce byte-equivalent timelines for debugging,
  approvals and render retries.
- Impact: template implementations must not call wall-clock, unseeded randomness or unordered
  external state during generation.

## ID-018: Schema evolution uses an explicit migration registry

- Date: 2026-07-27
- Status: accepted
- Decision: persisted documents retain semantic `schemaVersion`; ordered migrations create a new
  normalized v1 object and never rewrite historical revisions in place.
- Reason: project history must remain auditable as the editing contract evolves.
- Impact: every breaking schema release adds a migration and fixtures proving the supported path.

## ID-019: OTIO is a lossy, namespaced exchange projection

- Date: 2026-07-27
- Status: accepted
- Decision: export tracks, gaps, clips, transitions and asset URLs to OTIO while preserving
  HotelCut-only concepts under `metadata.hotelcut`.
- Reason: OTIO supports interoperability but does not model HotelCut typography, BrandKit or CTA
  semantics.
- Impact: OTIO files are never treated as the authoritative business document; imports require a
  future adapter and explicit loss handling.

## ID-020: Compilation evidence is a first-class result

- Date: 2026-07-27
- Status: accepted
- Decision: every automatic generation returns the validated project, generation manifest,
  per-candidate score records and structured warnings together.
- Reason: automatic choices must be explainable and reproducible, including candidates that were
  rejected.
- Impact: consumers persist generation evidence alongside a project revision rather than
  reconstructing it from logs.

## ID-021: Media selection uses deterministic integer scoring

- Date: 2026-07-27
- Status: accepted
- Decision: score readiness, fingerprints, tags, duration, orientation, speech, silence and
  quality with integer components and a seed-derived final tie-break.
- Reason: floating scoring or unstable sort order would make identical generations drift.
- Impact: changing weights or eligibility rules requires compiler-version and golden-fixture
  review.

## ID-022: Product templates are declarative slot layouts

- Date: 2026-07-27
- Status: accepted
- Decision: templates declare non-overlapping basis-point ranges, roles, accepted media, tag
  requirements, reuse/audio policy and optional caption/title/CTA/music layouts.
- Reason: business templates should describe editorial intent without invoking selection or
  renderer code.
- Impact: slot semantics belong to `@hotelcut/templates`; algorithms belong to
  `@hotelcut/compiler`.

## ID-023: Locks preserve selections; replacements preserve clip identity

- Date: 2026-07-27
- Status: accepted
- Decision: regeneration copies explicitly locked clip IDs/assets/source ranges from a matching
  previous project. Single-shot replacement retains the target clip ID and all unrelated clips.
- Reason: users need stable references and control over approved shots before the M5 editor is
  introduced.
- Impact: missing locks and A-roll caption staleness are warnings, never silent behavior.

## ID-024: The compiler never invents business facts

- Date: 2026-07-27
- Status: accepted
- Decision: CTA text, action and destination come only from validated approved input; absent CTA
  or media produces warnings.
- Reason: generated booking/contact claims can create operational and legal risk.
- Impact: templates control placement and timing, not factual CTA content.

## ID-025: Editing uses pure validated commands

- Date: 2026-07-28
- Status: accepted
- Decision: express every M5 edit as a typed command that returns a new project and validates the
  entire result against the canonical timeline schema.
- Reason: UI controls, future automation and external editors need one mutation boundary without
  exposing renderer or component state in persisted documents.
- Impact: new editing capabilities add command variants and tests; consumers never patch project
  JSON directly.

## ID-026: Browser preview is a review interpreter

- Date: 2026-07-28
- Status: accepted
- Decision: interpret project frames in the Web app for immediate review while keeping final
  media decoding, audio mixing and pixel rendering behind the M6 renderer adapter.
- Reason: M5 needs responsive corrections without prematurely coupling the canonical project to
  Remotion or FFmpeg.
- Impact: preview fidelity is sufficient for editorial timing and copy, but final-frame golden
  tests belong to M6.

## ID-027: Autosave creates immutable optimistic revisions

- Date: 2026-07-28
- Status: accepted
- Decision: debounce rapid edits in the client and save the full validated project with a required
  `baseRevision`; atomically advance the current pointer and insert an immutable revision.
- Reason: silent last-write-wins would lose hotel operator changes, while rewriting history would
  break auditability and render reproducibility.
- Impact: stale editors receive HTTP 409 and must reload or reconcile before retrying.

## ID-028: M5 Studio uses a fictional local adapter

- Date: 2026-07-28
- Status: accepted
- Decision: demonstrate the M5 editor with a local fictional project and an injectable save
  adapter while implementing and integration-testing the production project revision API
  independently.
- Reason: authenticated hotel/project workspace selection is owned by M7 and should not block
  review interaction or persistence contracts.
- Impact: the Studio is fully testable in isolation; M7 wires its adapter to selected tenant
  projects without changing editor commands.

## ID-029: Final rendering stays behind a renderer-neutral adapter

- Date: 2026-07-28
- Status: accepted
- Decision: keep Remotion types inside `@hotelcut/renderer`; domain, API, database and timeline
  contracts exchange only canonical projects, asset sources, progress and artifact metadata.
- Reason: persisted revisions and job orchestration must not depend on one rendering engine.
- Impact: a future renderer implements `RendererAdapter` without migrating project documents.

## ID-030: Remotion composes; FFmpeg normalizes and inspects

- Date: 2026-07-28
- Status: accepted
- Decision: use Remotion for frame composition and FFmpeg for deterministic H.264/AAC
  normalization, loudness, cover extraction, ffprobe, black detection and silence detection.
- Reason: each engine is used for the part it models and operates most reliably.
- Impact: the render-worker image must contain Chromium, FFmpeg and Chinese fonts.

## ID-031: Quality control is a pure success gate

- Date: 2026-07-28
- Status: accepted
- Decision: calculate eleven mandatory checks in `@hotelcut/quality-control` from explicit inputs
  and allow job success only when none fail.
- Reason: renderer completion alone does not prove the deliverable is usable.
- Impact: quality-failed artifacts remain diagnosable, but PostgreSQL and BullMQ both record a
  failed attempt rather than false success.

## ID-032: Render retries reuse the immutable database job

- Date: 2026-07-28
- Status: accepted
- Decision: retain one render job and increment its attempt when processing starts; give each
  BullMQ dispatch a unique queue ID while including the expected attempt in a versioned payload.
- Reason: retained BullMQ IDs can otherwise swallow a retry, while a new database job would split
  its audit trail.
- Impact: stale dispatches cannot start a non-queued job, and retries preserve logs, revision and
  attempt budget.

## ID-033: Artifacts become visible in one terminal persistence step

- Date: 2026-07-28
- Status: accepted
- Decision: upload deterministic per-attempt objects, then upsert six artifact rows, one quality
  report and the terminal job/project states in one PostgreSQL transaction.
- Reason: partial database writeback can incorrectly expose an incomplete or successful render.
- Impact: object cleanup for uploads left by a database outage is an operational M7+ concern.

## ID-034: M7 starts with an explicit development seed session

- Date: 2026-07-28
- Status: accepted
- Decision: expose the documented database seed account as an explicit local-only entry, then
  load organizations and hotels through the existing actor-scoped API boundary.
- Reason: the product plan permits a seed account in development and basic email login later; a
  fake password form or hidden hard-coded identity would misrepresent the authentication state.
- Impact: the workspace can exercise real tenant isolation now, while the UI must continue to
  label the session as development-only until formal email authentication replaces it.

## ID-035: Basic email authentication uses opaque database sessions

- Date: 2026-07-28
- Status: accepted
- Decision: hash local passwords with scrypt, issue 256-bit opaque tokens, persist only token
  digests and expiries, and deliver the raw token in an HttpOnly, SameSite cookie.
- Reason: browser-supplied user IDs cannot be a production trust boundary, while revocable opaque
  sessions keep identity server-owned without pulling enterprise SSO into the MVP.
- Impact: every protected API route resolves a current active user before tenant authorization;
  `x-user-id` is a non-production compatibility path and the seed credential is local-only.

## ID-036: BrandKit editing defers Logo selection to the asset library

- Date: 2026-07-29
- Status: accepted
- Decision: expose editable hotel and BrandKit text/style fields through existing
  administrator-scoped APIs, preserve any current `logoAssetId`, and do not accept a raw Logo
  asset ID in the Web form.
- Reason: a useful Logo picker must list only same-hotel image assets and validate ownership;
  exposing UUID entry before the M7 asset-library slice would create an unsafe and confusing
  workflow.
- Impact: the configuration slice is production-backed for hotel details and BrandKit defaults;
  the asset-library slice owns Logo selection and its cross-hotel failure states.

## ID-037: Browser uploads hash and transfer video incrementally

- Date: 2026-07-30
- Status: accepted
- Decision: compute SHA-256 from bounded browser slices, upload presigned multipart parts with
  bounded concurrency and complete the upload with the exact MinIO `ETag` values.
- Reason: whole-file buffering makes normal hotel footage unsafe on memory-constrained browsers,
  while application-proxied uploads add avoidable server bandwidth and timeout pressure.
- Impact: storage CORS must allow the Web origin and expose `ETag`; direct storage requests never
  receive session cookies, and the API remains responsible for size/checksum validation before
  analysis is queued.

## ID-038: Production compilation derives all media input on the server

- Date: 2026-07-30
- Status: accepted
- Decision: accept only a tenant-scoped VideoBrief ID, catalog template key and optional seed at
  the generation endpoint; load BrandKit and ready asset details through the repository, map
  analyzed timing and operator labels into compiler input, then persist revision one.
- Reason: accepting browser-supplied media candidates or project JSON would let clients bypass
  tenant ownership, readiness and analysis guarantees.
- Impact: the API depends on the pure compiler and template packages, compilation failures return
  explicit validation errors, and the browser receives only the persisted project plus a compact
  generation summary.

## ID-039: Production Studio saves immutable whole-document revisions

- Date: 2026-07-30
- Status: accepted
- Decision: reuse the M5 command/history editor for tenant-scoped projects, debounce complete
  validated documents into the existing revision endpoint and retain optimistic concurrency.
  Validate every referenced media asset against the persisted project hotel before saving.
- Reason: a second editor model or browser-authored patch format would split timeline behavior,
  while accepting arbitrary asset UUIDs would bypass the hotel ownership and readiness boundary.
- Impact: rapid changes create one auditable revision, stale editors receive HTTP 409 with an
  explicit reload action, and cross-hotel or incompatible media references fail before
  persistence.

## ID-040: Render delivery treats persisted job detail as the source of truth

- Date: 2026-07-30
- Status: accepted
- Decision: submit the current project through the existing immutable-revision render endpoint,
  poll only the selected active job and present persisted status, logs, quality report and
  artifacts. Request artifact download URLs individually from the API.
- Reason: queue progress alone cannot prove that post-processing, mandatory quality checks or
  artifact persistence completed, and browser-constructed object URLs would bypass membership
  authorization.
- Impact: Studio edits after submission cannot mutate the render input; cancellation and retry
  continue to follow the server state machine and attempt budget; every download uses a
  short-lived membership-checked URL without exposing storage credentials.
