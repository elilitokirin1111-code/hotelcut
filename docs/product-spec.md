# Product specification

## Product position

HotelCut is a hotel short-video automation system. It combines real-person presentation footage,
room and facility footage, promotions and a hotel BrandKit into a reviewable, editable and
renderable video project.

The first release is not a general-purpose editor or social publishing platform.

## MVP workflow

1. Create a hotel workspace.
2. Configure hotel information, BrandKit and approved CTA data.
3. Upload real-person, room, facility, service, promotion and brand media.
4. Analyze media while preserving manual tagging and recovery paths.
5. Select one of three hotel video templates.
6. Create a structured VideoBrief.
7. Compile a deterministic HotelVideoProject.
8. Preview and adjust captions, clips, CTA and music.
9. Queue a render.
10. Run quality checks and download artifacts.

## Initial templates

- Host presentation with hotel B-roll, normally 30-60 seconds.
- Room selling-point montage, normally 15-35 seconds.
- Hotel promotion video, normally 15-25 seconds.

## Required outputs

- versioned project JSON
- interactive preview
- MP4
- SRT
- cover frame
- media usage manifest
- generation explanation log
- quality report

## Product rules

- Automatic results remain editable.
- The same validated input, template version and seed produce the same timeline.
- Every automatic media selection is explainable.
- CTA facts come only from hotel configuration or explicit user input.
- External model capabilities can be disabled, mocked and recovered from.
- A failed analysis or render job is visible and retryable.
- Tenant data is isolated by organization and hotel.

## Explicit exclusions

The MVP excludes digital humans, voice cloning, generative video, automatic social publishing,
platform scraping or login, booking integrations, livestream editing, a professional free-form
timeline, plugin marketplaces and real-time collaborative editing.
