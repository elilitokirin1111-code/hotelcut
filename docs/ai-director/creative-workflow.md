# AI Director creative workflow

Status: Phases 1–2 implemented on 2026-08-05.

## Versioned workflow

1. Create a `CreativeProject` in idea, script, reference or assets mode.
2. Save the user's `CreativeBriefRevision`; the original input remains immutable.
3. Call `expand-idea` to produce exactly three versioned directions: safe conversion, strong hook,
   and premium brand.
4. Select a brief and generate a `ScriptPackage` with storyboard scenes and a shot list.
5. Revise a script with a natural-language instruction. This always creates a new ScriptPackage;
   it never mutates the selected version.
6. Select the intended script before progressing to asset matching and EditBlueprint generation.
7. Select an analyzed, ready video from the same hotel as a reference. The media worker persists
   deterministic scene, opening-cut, pace-curve and speech-coverage signals with the asset.
8. Generate a versioned `ReferenceVideoProfile`. It learns only reusable narration, pacing,
   transition, subtitle and audio rules; it cannot be used to copy people, dialogue, brand facts or
   source-video content.

## AI contract and safety

The API reads the hotel's existing encrypted provider configuration. Alibaba Bailian uses the
existing compatible Chat Completions endpoint; the request includes the strict JSON Schema and
JSON-object response mode, and the server performs a strict Zod parse before it writes any result.
OpenAI Responses and OpenAI-compatible providers use native strict `json_schema` response format.

Each AI operation records an `ai_generation_runs` audit row with model name, prompt version,
generation parameters, redacted input/output summaries, status, retry attempt and failure reason.
The API rejects a script if its summed scene duration differs from the selected brief duration by
more than 10 percent. Every scene requires visual, action, dialogue-or-narration field and duration;
the shot list links its shooting requirements to scene sequence.

## Phase 1 endpoints

- `POST/GET /v1/creative-projects/:projectId/brief-revisions`
- `POST /v1/creative-projects/:projectId/expand-idea`
- `POST /v1/creative-projects/:projectId/select-brief`
- `POST /v1/creative-projects/:projectId/generate-script`
- `GET /v1/creative-projects/:projectId/scripts`
- `POST /v1/creative-projects/:projectId/scripts/:scriptId/revise`
- `POST /v1/creative-projects/:projectId/select-script`

The Web AI creation workspace exposes these operations after a user chooses a CreativeProject.
Existing fixed-template automatic editing remains unchanged.

## Phase 2 reference-video analysis

`REFERENCE_ANALYSIS_ENABLED` independently gates this capability. A reference upload remains an
ordinary production-media upload and must finish the existing analysis queue first; a failed or
incomplete asset returns `REFERENCE_VIDEO_NOT_READY` and cannot affect the production asset library.

- `POST /v1/creative-projects/:projectId/reference-profiles` accepts a ready video `assetId`,
  invokes the configured Bailian provider through the same strict JSON Schema/Zod boundary, and
  persists an immutable incrementing profile revision.
- `GET /v1/creative-projects/:projectId/reference-profiles` returns the project's version history.

The profile has raw measurable values (duration, detected shot count and average shot duration) plus
validated semantic outputs: hook duration, pace/emotion ranges, shot distribution, transition,
caption and audio profiles, a narrative pattern and reusable style rules. The original analysis
metadata remains the source of truth; an AI failure creates an audited failed generation run but does
not alter the asset or any selected production project.

## Phase 3 asset requirements and matching

Selecting a ScriptPackage now converts every persisted `ShotRequirement` into a current
`AssetRequirement`. Matching is deterministic and runs only over tenant-scoped, ready video assets
and their existing analyzed scene segments. It scores semantic tag/category/description hits, usable
duration and the existing quality score; each requirement returns no more than three ranked
candidates with reasons and quality issues.

- `POST /v1/creative-projects/:projectId/asset-requirements/generate`
- `GET /v1/creative-projects/:projectId/asset-requirements`
- `PUT /v1/creative-projects/:projectId/asset-requirements/:requirementId/assignment`

Status is `matched`, `weak_match` or `missing`. A missing requirement carries a specific filming
instruction derived from the desired framing, motion, duration and semantic tags. A user can replace
the automated choice with any authorized hotel asset; this changes only the requirement confirmation,
never the original media or ScriptPackage.
