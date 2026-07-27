# Architecture

## Runtime services

```text
Web
  |
  v
Fastify API ---- PostgreSQL
  |        \---- S3-compatible storage
  |
  +---- Redis / BullMQ ---- Render Worker ---- RendererAdapter
  |
  +---- Redis / BullMQ ---- Python Analysis Worker
                              |---- MinIO originals/derivatives
                              |---- ffprobe / FFmpeg
                              |---- PySceneDetect
                              \---- faster-whisper provider
```

The API persists through a tenant-scoped repository and reports PostgreSQL readiness. Compose
runs an idempotent migration-and-seed bootstrap before the API starts. M2 media analysis runs
outside the request process; rendering begins in M6.

## Technology choices

- Web: React, TypeScript, Vite, Tailwind CSS
- API: Node.js 22, TypeScript, Fastify, Zod
- Persistent data: PostgreSQL
- Queue and coordination: Redis and BullMQ
- Analysis: Python 3.12, FFmpeg/ffprobe, faster-whisper, PySceneDetect and OpenCV
- Rendering: Remotion behind an adapter, with FFmpeg preprocessing and post-processing
- Object storage: MinIO locally and an S3-compatible provider in production

## API package flow

```text
Fastify routes -> domain repository contract -> PostgreSQL repository -> Drizzle -> PostgreSQL
       |
       +-> Zod schemas -> OpenAPI
```

## M2 media flow

```text
Client -> API: register upload
API -> MinIO: create multipart upload + presigned part URLs
Client -> MinIO: upload parts
Client -> API: complete upload
API -> PostgreSQL: Asset uploaded + AnalysisJob queued
API -> BullMQ: language-neutral analysis payload
Worker -> MinIO: download + SHA-256 validation
Worker -> ffprobe/FFmpeg/PySceneDetect/transcriber
Worker -> MinIO: deterministic derivative keys
Worker -> PostgreSQL: atomic metadata, segments, derivatives and terminal job state
```

Automatic segments are replaced on retry, manual segments are retained, and derivative rows are
upserted by asset and kind. Each attempt runs in an isolated temporary directory.

## Core boundary

```text
HotelVideoProject
        |
        v
Timeline Compiler
        |
        v
RendererAdapter
  |       |       |
Remotion FFmpeg OpenCut (future)
```

Domain and timeline packages own their schemas. Renderer-specific types may exist only inside
renderer adapters.

M3 stops at renderer-neutral project structure and deterministic template execution. M4 owns
the timeline compiler that selects analyzed media and invokes product templates.

## Long-running work

API requests create jobs and return identifiers. Analysis and rendering run in independent
workers, publish progress, persist terminal states and support idempotent retries.

## Package ownership

- M1: domain, schemas, database (implemented)
- M2: storage, job queue and media probe contracts (implemented)
- M3: timeline schema, migration, OTIO prototype and template SDK (implemented)
- M4: timeline compiler, hotel templates and generation explanations
- M6: renderer contracts, implementations and quality control
- M8: OpenCut adapter
