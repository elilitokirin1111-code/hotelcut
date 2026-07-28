# Data model

Status: M1 core model, M2 media lifecycle, M5 revisions, M6 rendering and M7 sessions implemented.

## Tenant and hotel

- Organization
- User
- UserSession
- Membership
- Hotel
- BrandKit

Every tenant-owned record carries an organization or hotel boundary. Authorization must be
checked by repository queries as well as API handlers.

`Membership` is unique by organization and user. A hotel name is unique inside an organization,
and a hotel has at most one BrandKit.

`User.passwordHash` is nullable so future external-identity users do not require a local
credential. `UserSession` stores only a unique token digest, the owning user, creation time and
expiry. Session deletion revokes access immediately; deleting a user cascades to every session.

## Media and projects

- Asset
- AssetUpload
- AssetDerivative
- AssetSegment
- AnalysisJob
- VideoBrief
- VideoProject
- ProjectRevision

Original filenames are metadata only, never storage identities. Projects are revisioned, and
renders bind to an immutable project revision.

`VideoProject.currentRevision` is the optimistic concurrency pointer. Creating a project writes
revision 1. Saving requires the caller's `baseRevision`; the repository atomically advances the
pointer only when it still matches, then inserts the next immutable `ProjectRevision`. A stale
caller receives a conflict and cannot silently overwrite newer work. Historical revision
documents are never updated in place.

Asset storage locations and project revision numbers are unique. Segment time ranges, byte sizes,
multipart sizes/counts, job attempts, brief durations and score ranges are protected by database
checks. `logoAssetId` remains a nullable soft reference so BrandKit can exist before a logo is
uploaded.

The M2 asset lifecycle is:

```text
registered -> uploaded -> analyzing -> ready
                  ^            |
                  |            v
                  +--------- failed
```

`AssetUpload` stores the provider upload ID and completion state. `AssetDerivative` is unique by
asset and kind (`proxy`, `thumbnail`, `audio`). `AssetSegment` distinguishes automatic scene,
speech and VAD ranges from manual labels. `AnalysisJob` stores attempts, structured logs and
terminal error details.

## Jobs and artifacts

- RenderJob
- RenderArtifact
- QualityReport

Job state transitions are explicit, tested and idempotent. A render cannot become successful
until required artifacts exist and quality checks have completed.

The initial state machine is:

```text
queued -> preprocessing -> rendering -> validating -> succeeded
   \           \              \             \-> failed
    \           \              \-> failed
     \           \-> failed
      \-> cancelled
```

Cancellation is also permitted during preprocessing and rendering. Succeeded, failed and
cancelled jobs are terminal.

`RenderJob` additionally stores `projectRevisionId`, a SHA-256 `inputHash`, attempt budget,
progress basis points, structured logs, cancellation time and traceable terminal error fields.
Every job therefore proves exactly which immutable document it consumed.

`RenderArtifact` is unique by render job and kind. M6 persists `video`, `thumbnail`, `captions`,
`project`, `manifest` and `report`, including bucket/key, content type, byte size and SHA-256.
`QualityReport` is unique by render job and stores status, score basis points and the complete
machine-readable check details.

## M1 implementation

- Drizzle schema and migrations from an empty database
- repository interfaces and implementations
- seed data using fictional hotels
- Zod API schemas and OpenAPI exposure
- unit tests for constraints and job state transitions
- PostgreSQL/API integration tests for tenant scoping and business persistence

## M2 implementation

- five media enums and three new tables, bringing the public business schema to 16 tables
- upload and asset repository methods with membership-scoped joins
- retry-safe analysis job persistence
- automatic-segment replacement with manual-segment preservation
- derivative upserts and structured per-attempt logs

## M5 implementation

- tenant-scoped project listing, creation and detail reads
- renderer-independent project documents validated at the API boundary
- immutable revision history ordered newest first
- atomic revision creation guarded by the current revision number
- not-found isolation for users outside the owning organization

## M6 implementation

- immutable render-job creation against the current or explicitly requested project revision
- progress, cancellation, manual retry budget and structured diagnostic logs
- tenant-scoped job details, artifact lookup and signed download URLs
- atomic terminal persistence of six artifact kinds and one quality report
- project status returns to `draft` on failure/cancellation and becomes `completed` only after
  quality-gated success
