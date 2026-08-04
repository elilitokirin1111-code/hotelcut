# Packages

Shared domain packages are introduced by their owning milestone:

- `domain`: repository contracts, domain errors and render-job state rules
- `auth`: scrypt password hashing and opaque session-token primitives
- `schemas`: Zod contracts shared by API and persistence boundaries
- `database`: Drizzle tables, migrations, seed data and PostgreSQL repositories
- `storage`: S3-compatible multipart upload and signed download contracts
- `media`: language-neutral media-analysis queue and probe contracts
- `job-queue`: versioned BullMQ analysis and render producers
- `timeline`: renderer-independent project schema, validation, migration, stable JSON and OTIO
  export
- `template-sdk`: deterministic template input/output contracts and execution context
- `compiler`: automatic filtering, scoring, selection, layout, manifest and regeneration
- `templates`: three declarative hotel slot templates and golden fixtures
- `editor`: pure validated edit commands, scene projections and bounded undo/redo history
- `renderer`: renderer-neutral contract, Remotion composition and FFmpeg post-processing
- `quality-control`: pure mandatory checks and machine-readable output reports
- M8: OpenCut adapter

The M1 through M6 packages and the M7 authentication primitives are implemented. Later package
boundaries remain unimplemented until their owning milestone.
