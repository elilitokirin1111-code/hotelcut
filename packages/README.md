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
- M4-M6: timeline compiler, templates, renderers and quality control
- M8: OpenCut adapter

The M1, M2 and M3 packages are implemented. Later package boundaries remain unimplemented until
their owning milestone.
