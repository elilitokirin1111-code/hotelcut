# Media analysis

Status: implemented in M2.

## Pipeline

1. The API creates a tenant-scoped asset and MinIO multipart upload.
2. The client uploads directly through short-lived presigned part URLs.
3. The API completes the upload, verifies object size and SHA-256 metadata, persists a queued
   analysis job and publishes the language-neutral BullMQ payload.
4. The worker downloads into an isolated temporary directory and recomputes SHA-256.
5. ffprobe records codec, duration, frame rate, resolution, channels and rotation.
6. FFmpeg creates a 720-pixel editing proxy, JPEG thumbnail and 16 kHz mono WAV. Silent videos
   receive a deterministic silent WAV.
7. PySceneDetect creates scene ranges and FFmpeg samples up to eight representative JPEG frames.
8. The worker resolves the hotel's encrypted model setting for every job. OpenAI uses Responses;
   Alibaba Cloud Model Studio (Bailian) uses OpenAI-compatible Chat Completions with Base64 image
   URLs and JSON mode. Both return hotel-scene tags, editorial quality scores, visible selling
   points and unusable-shot decisions.
9. The selected transcription provider creates speech segments, word timestamps and VAD ranges.
10. Derivatives use deterministic object keys and are upserted.
11. One PostgreSQL transaction replaces automatic segments, preserves manual tags, writes
    metadata and marks the job successful.

The local Compose default is `ANALYSIS_TRANSCRIPTION_PROVIDER=mock`, which produces deterministic
Chinese test output without downloading a model. `faster-whisper` enables real word timestamps
and VAD; `disabled` leaves transcription empty while keeping the rest of the pipeline usable.

The recommended browser configuration is Alibaba Cloud Model Studio with a region-matched
workspace Base URL, `qwen3.7-plus` and Chat Completions. The API key is AES-256-GCM encrypted in
PostgreSQL and is never returned to the browser. The legacy `OPENAI_API_KEY` environment setting
remains a fallback when the hotel has no stored setting. A maximum of eight representative
frames are sent; temporary image payloads are deleted with the isolated job directory and are
not persisted as derivatives. Provider failures are recorded in `metadata.vision` and fall back
to deterministic/manual tags unless `OPENAI_VISION_REQUIRED=true`.

Analysis workers use isolated temporary directories, sanitized process arguments and retry-safe
jobs. Commands are argument arrays with `shell=False`.

## State and retry behavior

BullMQ retries each job up to three times with exponential backoff. The worker increments the
database attempt counter at start. Non-final failures return the asset to `uploaded` and the job
to `queued`; the last failure marks both failed. A manual retry creates a new job ID.

Reprocessing is idempotent:

- a succeeded job exits without rewriting data
- proxy, thumbnail and audio keys are deterministic
- derivative records are upserted by asset/kind
- only automatic segments are deleted and rebuilt
- manual labels survive retries

## M2 API surface

- `GET /v1/hotels/:hotelId/assets`
- `POST /v1/hotels/:hotelId/assets/uploads`
- `POST /v1/assets/:assetId/uploads/complete`
- `GET /v1/assets/:assetId`
- `POST /v1/assets/:assetId/analysis/retry`
- `POST /v1/assets/:assetId/segments`
- `GET /v1/assets/:assetId/derivatives/:kind/download`

The asset detail response includes normalized probe/transcript/vision metadata, derivatives,
AI-scored scene segments and structured analysis logs.

## M7 browser workflow

The hotel workspace uses the M2 API directly. It hashes files in bounded slices, uploads
presigned parts with bounded concurrency, reports hashing and upload progress, then follows the
asset state until analysis is terminal. MinIO must allow the configured Web origins and expose
the multipart `ETag` header. Signed proxy and thumbnail URLs remain short-lived and storage
requests do not include application credentials.
