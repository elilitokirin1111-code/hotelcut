# AI Director architecture

Status: Phase 0 foundation implemented on 2026-08-05.

## Compatibility boundary

AI Director is an additive orchestration layer. The existing VideoBrief, three catalog templates,
Compiler, HotelVideoProject v1, Studio, Renderer, media pipeline and quality-control packages remain
the production path for fixed-template automatic editing.

The dynamic path is deliberately one-way:

```text
CreativeProject
  -> versioned creative/script/reference results
  -> validated EditBlueprint
  -> Blueprint Validator
  -> Dynamic Template Builder
  -> CompilationTemplate
  -> existing Compiler
  -> validated HotelVideoProject revision
```

An unvalidated model response is never persisted as a `HotelVideoProject`. AI-producing operations
must record model name, prompt version, generation parameters, an input summary, attempt status and
failure reason in `ai_generation_runs`. Domain result tables remain immutable by revision; a
`CreativeProject` stores only the currently selected revision identifiers.

## Phase 0 surface

- Feature flags: `AI_DIRECTOR_ENABLED`, `REFERENCE_ANALYSIS_ENABLED`,
  `DYNAMIC_BLUEPRINT_ENABLED`, and `AI_REVIEW_ENABLED`.
- Tenant-scoped `CreativeProject` repository and API create/list/read/update operations.
- Four Web entry modes: idea, script/prompt, reference video and existing assets.
- Migration `0005_swift_ben_grimm.sql` establishes additive AI Director tables and adds an asset
  purpose without changing existing production-asset behavior.

## Phase 2 reference profiles

Migration `0006_youthful_tarot.sql` makes `reference_video_profiles` revisioned per
CreativeProject/asset pair. The existing analysis worker adds a `referenceFeatures` metadata object
to every successfully analyzed video: scene count, average shot duration, opening-cut count,
per-shot pace curve, VAD ranges and speech coverage. This is deterministic pipeline output, not a
model guess.

The API combines those signals with the existing transcript, vision and segment analysis, calls the
hotel-configured model, validates the result with the reference-profile Zod schema, then persists the
immutable profile. `REFERENCE_ANALYSIS_ENABLED` is checked server-side on both profile endpoints;
the Web workspace hides the controls when it is unavailable.

All flags are server-owned. A disabled capability returns a not-found response so partially rolled
out functionality cannot be discovered or invoked by an unauthorized browser client.
