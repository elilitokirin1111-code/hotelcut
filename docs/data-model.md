# Data model

Status: M1 core model and M2 media lifecycle implemented.

## Tenant and hotel

- Organization
- User
- Membership
- Hotel
- BrandKit

Every tenant-owned record carries an organization or hotel boundary. Authorization must be
checked by repository queries as well as API handlers.

`Membership` is unique by organization and user. A hotel name is unique inside an organization,
and a hotel has at most one BrandKit.

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
