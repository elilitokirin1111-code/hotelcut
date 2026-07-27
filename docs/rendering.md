# Rendering

Status: planned for M6.

Render requests bind to an immutable project revision and an input hash. The API queues work;
workers report progress and terminal state.

`RendererAdapter` separates the domain from engines:

- RemotionRenderer: parameterized templates, captions, animation and preview parity
- FFmpegRenderer: media operations and supported fallback composition
- OpenCutRenderer: optional future implementation only

Required artifacts are MP4, SRT, cover frame, normalized project JSON, media manifest and quality
report. A failed attempt does not mutate the project or report success, and retries remain
idempotent.

Remotion product licensing and production cost require an explicit review before commercial
launch.
