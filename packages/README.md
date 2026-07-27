# Packages

Shared domain packages are introduced by their owning milestone:

- `domain`: repository contracts, domain errors and render-job state rules
- `schemas`: Zod contracts shared by API and persistence boundaries
- `database`: Drizzle tables, migrations, seed data and PostgreSQL repositories
- `storage`: renderer-independent object reference and storage contracts
- M2: job queue and media probe contracts
- M3: timeline, compiler and template SDK
- M4-M6: templates, renderers and quality control
- M8: OpenCut and OTIO adapters

The four M1 packages are implemented. Later package boundaries remain unimplemented until their
owning milestone.
