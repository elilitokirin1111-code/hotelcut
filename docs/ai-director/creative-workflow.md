# AI Director creative workflow

Status: Phase 1 implemented on 2026-08-05.

## Versioned workflow

1. Create a `CreativeProject` in idea, script, reference or assets mode.
2. Save the user's `CreativeBriefRevision`; the original input remains immutable.
3. Call `expand-idea` to produce exactly three versioned directions: safe conversion, strong hook,
   and premium brand.
4. Select a brief and generate a `ScriptPackage` with storyboard scenes and a shot list.
5. Revise a script with a natural-language instruction. This always creates a new ScriptPackage;
   it never mutates the selected version.
6. Select the intended script before progressing to asset matching and EditBlueprint generation.

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
