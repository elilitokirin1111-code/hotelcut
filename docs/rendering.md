# Rendering

Status: implemented in M6.

Render requests bind to an immutable project revision and an input hash. The API queues work;
workers report progress and terminal state.

`@hotelcut/renderer` keeps the domain and persisted project free of engine-specific types.
`RendererAdapter.render()` accepts an immutable project revision, resolved asset URLs, a
cancellation signal and a progress callback.

- `RemotionRenderer` translates timeline clips, safe areas, BrandKit tokens, transitions,
  captions, audio and CTA into a 1080 by 1920 composition.
- `FfmpegPostProcessor` normalizes H.264/AAC output, loudness and frame rate, extracts the cover,
  probes codecs and detects long black or silent ranges.
- `OpenCutRenderer` remains an optional future adapter only.

Required artifacts are MP4, SRT, cover frame, normalized project JSON, media manifest and quality
report. They use deterministic keys under `renders/{jobId}/attempt-{attempt}/`.

## Job flow

```text
API -> PostgreSQL queued job -> BullMQ hotelcut-render
    -> worker binds immutable revision and presigns ready assets
    -> Remotion frames -> FFmpeg normalization/probe/detection
    -> mandatory quality control -> MinIO artifacts
    -> one PostgreSQL terminal-state transaction
```

The worker polls cancellation while rendering and bridges it to both Remotion and FFmpeg.
Queued cancellation is immediate; an in-flight request becomes `cancelled` after the worker
acknowledges it. Failed and cancelled jobs may be manually retried until `maxAttempts` is
exhausted. Each queue dispatch receives a unique BullMQ ID so retrying a previously completed
dispatch cannot be swallowed by BullMQ job retention.

Progress is stored as integer basis points with structured, timestamped stage logs. A queue
publish failure is persisted as a traceable failed job. Renderer and upload failures return the
video project to `draft`; a failed attempt never edits its bound revision.

## API

- `GET|POST /v1/video-projects/:id/render-jobs`
- `GET /v1/render-jobs/:id`
- `POST /v1/render-jobs/:id/cancel`
- `POST /v1/render-jobs/:id/retry`
- `GET /v1/render-artifacts/:id/download`

All reads and operator actions are membership scoped. Artifact downloads use short-lived
S3-compatible signed URLs.

## Local verification

`pnpm --filter @hotelcut/renderer acceptance:golden` generates fixed synthetic video, image and
audio sources and performs full-duration renders of host+B-roll, room montage and promotion. The
script writes ignored evidence under `tmp/m6-acceptance`.

After the Compose stack is built, the same acceptance can be run against the packaged Linux
runtime:

```sh
docker compose exec -T render-worker node packages/renderer/scripts/render-golden-fixtures.mjs
```

Remotion product licensing and production cost require an explicit review before commercial
launch.
