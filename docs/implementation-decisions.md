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
