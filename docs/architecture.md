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
  +---- analysis job boundary ---- Python Analysis Worker
```

The M1 API persists through a tenant-scoped repository and reports PostgreSQL readiness. Compose
runs an idempotent migration-and-seed bootstrap before the API starts. Media analysis begins in
M2 and rendering in M6.

## Technology choices

- Web: React, TypeScript, Vite, Tailwind CSS
- API: Node.js 22, TypeScript, Fastify, Zod
- Persistent data: PostgreSQL
- Queue and coordination: Redis and BullMQ
- Analysis: Python 3.12, later FFmpeg, faster-whisper, PySceneDetect, PyAV and OpenCV
- Rendering: Remotion behind an adapter, with FFmpeg preprocessing and post-processing
- Object storage: MinIO locally and an S3-compatible provider in production

## M1 package flow

```text
Fastify routes -> domain repository contract -> PostgreSQL repository -> Drizzle -> PostgreSQL
       |
       +-> Zod schemas -> OpenAPI
```

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

## Long-running work

API requests create jobs and return identifiers. Analysis and rendering run in independent
workers, publish progress, persist terminal states and support idempotent retries.

## Package ownership

- M1: domain, schemas, database, storage (implemented)
- M2: job queue and media probe contracts
- M3: timeline, timeline compiler and template SDK
- M4: hotel templates and generation explanations
- M6: renderer contracts, implementations and quality control
- M8: OpenCut and OTIO adapters
