# Packages

Shared domain packages are introduced by their owning milestone:

- `domain`: repository contracts, domain errors and render-job state rules
- `schemas`: Zod contracts shared by API and persistence boundaries
- `database`: Drizzle tables, migrations, seed data and PostgreSQL repositories
- `storage`: S3-compatible multipart upload and signed download contracts
- `media`: language-neutral media-analysis queue and probe contracts
- `job-queue`: BullMQ analysis producer
- `timeline`: renderer-independent project schema, validation, migration, stable JSON and OTIO
  export
- `template-sdk`: deterministic template input/output contracts and execution context
- `compiler`: automatic filtering, scoring, selection, layout, manifest and regeneration
- `templates`: three declarative hotel slot templates and golden fixtures
- M5-M6: preview/editing, renderers and quality control
- M8: OpenCut adapter

The M1 through M4 packages are implemented. Later package boundaries remain unimplemented until
their owning milestone.
