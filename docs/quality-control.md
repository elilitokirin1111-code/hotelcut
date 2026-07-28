# Quality control

Status: implemented in M6.

Every rendered output is checked before the job is marked successful.

Minimum checks:

- output exists and ffprobe can read it
- expected 1080 by 1920 dimensions
- expected frame rate
- duration close to the project duration
- required audio track exists
- captions stay inside safe areas
- no referenced media is missing
- no unexpected long black or silent sections
- CTA fields required by the template are complete

Reports contain machine-readable checks plus human-readable warnings and failures. Visual Golden
rendering covers the three initial templates with fixed media.

`@hotelcut/quality-control` is a pure package: it receives the canonical project, ffprobe output,
manifest completeness and FFmpeg detection ranges. It does not access storage, the database or
the renderer.

The implemented checks are:

1. `output_exists`
2. `ffprobe_readable`
3. `vertical_resolution`
4. `frame_rate`
5. `duration`
6. `audio_track`
7. `caption_safe_area`
8. `asset_completeness`
9. `black_frames`
10. `abnormal_silence`
11. `cta_completeness`

Duration tolerance is the greater of 150 ms or two project frames. A black range fails at the
greater of two seconds or 8% of project duration; a silent range fails at the greater of five
seconds or 20%. Caption checks estimate line wrapping inside the referenced normalized safe
area, and CTA actions that navigate, contact or book require a destination.

The score is stored in integer basis points. Any failed mandatory check makes both the quality
report and render job fail. Artifacts and the report remain available for diagnosis, but no
quality-failed job is reported as successful.
