# Quality control

Status: planned for M6.

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
tests sample key frames from the three initial templates.
