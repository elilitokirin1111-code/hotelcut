# Preview and simplified editing

M5 lets a hotel operator review and correct an automatically generated
`HotelVideoProject` without editing JSON. It deliberately stops before final rendering.

## Studio surface

The Studio combines:

- a vertical frame preview with play, pause and scrub controls
- a scene rail for navigating the generated story
- a simplified video, caption, overlay and audio timeline
- shot replacement and source in/out trimming
- title, caption and approved CTA editing
- background-music replacement
- undo, redo, debounced autosave and visible revision state

The browser preview interprets canonical project frames with deterministic artwork. It is a
review tool, not a pixel-accurate Remotion or FFmpeg render. M6 remains responsible for final
fonts, media decoding, transitions, audio mixing and artifact generation.

## Command boundary

`@hotelcut/editor` accepts a discriminated command:

| Command              | Result                                                         |
| -------------------- | -------------------------------------------------------------- |
| `replace-clip-asset` | changes one compatible visual source and preserves clip ID     |
| `trim-video`         | changes source in/out and derives rate to keep timeline length |
| `update-caption`     | updates caption text and clears stale word timestamps          |
| `update-title`       | updates a text overlay                                         |
| `update-cta`         | updates the existing approved CTA text                         |
| `replace-music`      | updates every background-music loop to one audio asset         |

Commands parse their payload, target only the compatible clip type and validate the entire
result with the timeline schema. They return a new project object and never mutate the previous
revision. CTA editing cannot create a CTA where approved CTA data is absent.

Shot trimming preserves the clip's project duration. It changes the source range and derives a
playback rate, capped by the timeline contract, so downstream clips do not shift unexpectedly.

## History and autosave

The history store keeps bounded past and future stacks. A new command after undo creates a new
branch and discards the former redo stack.

The Web app batches rapid edits behind a debounce. The save adapter receives the complete
validated project and its `baseRevision`. Successful saves advance the visible revision; failed
saves remain visibly failed and may be retried without an uncontrolled retry loop.

## Project API

The implemented routes are:

- `GET/POST /v1/hotels/:hotelId/video-projects`
- `GET /v1/video-projects/:id`
- `GET/POST /v1/video-projects/:id/revisions`

Project creation persists revision 1. Revision creation uses optimistic concurrency and returns
HTTP 409 for a stale base revision. Repository joins enforce membership, so a caller outside the
organization receives the same not-found response as an unknown project.

M5 ships a fictional local Studio adapter so the editing surface is independently demonstrable.
The API boundary is ready for the authenticated hotel/project workspace to select and save real
projects in M7.
