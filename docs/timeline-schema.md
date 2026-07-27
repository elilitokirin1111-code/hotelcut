# Timeline schema

Status: M3 implemented.

`HotelVideoProject` is the renderer-independent source of truth. The runtime Zod schema,
inferred TypeScript types and generated JSON Schema live in `packages/timeline`.

## Version 1 contract

The `1.0.0` document contains:

- stable project, hotel and immutable template-version identifiers
- vertical-video output settings and one integer frame rate
- named safe areas and resolved, typed BrandKit tokens
- an optional top-level CTA
- ordered video, audio, overlay and caption tracks
- video, image, audio, text and caption clips
- transforms and renderer-neutral transitions
- compiler version, unsigned 32-bit seed and namespaced metadata

Time is always represented by non-negative integer frames. `startFrame` is inclusive and
`durationFrames` is positive. Source ranges use the same project frame rate. Floating-point
seconds and implicit wall-clock timestamps are not allowed.

## Validation invariants

Zod performs structural and cross-field validation. The parser rejects:

- duplicate track, clip, safe-area or brand-token identifiers
- clips outside the project duration
- overlapping clips on the same track
- clip kinds placed on incompatible track kinds
- transitions or audio fades longer than their clip
- caption word timing outside its caption
- missing or incorrectly typed font/color token references
- missing safe-area references
- an empty timeline

`parseHotelVideoProject` throws `TimelineValidationError`. Every issue includes a readable path,
for example `tracks[0].clips[1].startFrame`.

## Determinism and fixtures

`stableStringifyHotelVideoProject` validates, applies defaults and sorts object keys while
preserving array order. The same normalized input therefore produces byte-equivalent JSON.

Committed artifacts:

- `packages/timeline/schema/hotel-video-project-v1.schema.json`
- `packages/timeline/fixtures/hotel-video-project-v1.json`
- `packages/timeline/fixtures/hotel-video-project-v0.9.json`
- `packages/timeline/fixtures/basic-timeline.otio`

Regenerate the machine-owned artifacts with:

```bash
pnpm --filter @hotelcut/timeline generate:artifacts
```

Unit tests fail if either generated artifact drifts from its source implementation.

## Migration

`TimelineMigrationRegistry` maps one semantic schema version to the next and detects missing
paths or cycles. The default registry includes the real `0.9.0 -> 1.0.0` migration, converting
legacy integer milliseconds into frame-aligned ranges and filling explicit v1 defaults.

All persisted revisions must retain their original `schemaVersion`. Call
`migrateHotelVideoProject` before editing or compiling an older revision. Never mutate a stored
historical revision in place.

## OTIO exchange

`exportHotelVideoProjectToOtio` produces a basic OpenTimelineIO timeline. Absolute HotelCut
starts become OTIO gaps, asset references use `hotelcut://asset/{assetId}`, and HotelCut-only
concepts are preserved under `metadata.hotelcut`. Text and captions use missing-media references
because OTIO has no HotelCut typography model.

OTIO is a deliberately lossy interchange representation, not the HotelCut database or rendering
source of truth. The golden fixture is parse-verified with the official OpenTimelineIO library.
