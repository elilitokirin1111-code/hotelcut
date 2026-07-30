# Automatic editing compiler

Status: M4 implemented.

`@hotelcut/compiler` turns a validated brief, immutable template version, resolved BrandKit,
approved CTA and analyzed media candidates into a valid `HotelVideoProject`. It does not access
databases, clocks, renderers or external models.

## Input contract

The compiler extends the M3 template input with:

- media readiness and optional SHA-256 content fingerprint
- width, height, frame rate, audio presence, silence ratio and technical quality
- scene, speech, VAD and manual segments in integer frames
- segment tags, analysis score, transcript and optional word timing
- an optional previous project and explicit locked clip IDs for regeneration

The compiler rejects invalid timing, a mismatched template/project identity and durations
outside the template's declared range before selection begins.

## Compilation stages

1. Filter media that is not ready, has an incompatible kind, is too short or cannot satisfy an
   A-roll audio/silence requirement.
2. Collapse matching content fingerprints to the highest-quality asset.
3. Build scene or speech-range candidates and split long A-roll ranges at deterministic frame
   boundaries.
4. Score every candidate for every slot using analyzed base score, quality, required/preferred
   tags, duration slack, portrait orientation, speech availability, silence and a seeded
   tie-break.
5. Select the highest eligible candidate while enforcing per-slot reuse rules.
6. Place main and B-roll tracks, muting non-speaking visual material.
7. Wrap Chinese/Latin captions by visual width and paginate them inside the caption safe area.
8. Derive CTA timing only from the approved CTA input and declarative template range.
9. Select background music and loop a short source with boundary fades to cover the project.
10. Validate the final timeline and emit an ordered explanation log.

Every score component is an integer and every sort has a deterministic final key. The compiler
uses no wall-clock data or unseeded randomness.

## Result contract

Every successful generation returns:

- `project`: validated `HotelVideoProject` JSON
- `manifest`: compiler/template versions, seed, input hash, operation, slots, asset usage, locks
  and ordered explanation log
- `scoreRecords`: eligible and rejected candidates with score components and reasons
- `warnings`: unmet optional/required slots, absent approved CTA, missing music/captions or lock
  recovery problems

An unmet media requirement creates a warning and an empty manifest slot. The compiler never
fabricates an asset, transcript, CTA fact or booking destination.

## Regeneration and replacement

Regeneration accepts a previous matching project. Clips listed in `lockedClipIds` retain their
clip ID, asset and source range; all unlocked decisions are recomputed from the new seed. Missing
locks and unavailable locked media are explicit warnings.

`replaceVideoClip` validates one requested asset/segment against the original slot. It preserves
the target clip ID, transform and transitions while leaving all other visual clip identities
unchanged. Replacing A-roll warns that captions may need regeneration.

## Initial templates

| Template ID          | Duration | Structure                                      |
| -------------------- | -------- | ---------------------------------------------- |
| `hotel.host-broll`   | 30-60 s  | Three A-roll speech slots plus three B-rolls   |
| `hotel.room-montage` | 15-35 s  | Five room/facility selling-point montage slots |
| `hotel.promotion`    | 15-25 s  | Four hotel/service/offer promotion slots       |

All templates use basis-point ranges resolved once into integer project frames. They include
title, CTA and music layout; the host template also enables generated captions.

## Fixtures

The fixed analyzed media library is
`packages/templates/fixtures/m4-compiler-input.json`. Golden results contain the project,
manifest, all score records and warnings for each template.

Regenerate them after an intentional compiler or template change:

```bash
pnpm templates:fixtures
```

Template tests fail on any unapproved golden drift.

## M7 production adapter

`POST /v1/hotels/:hotelId/video-projects/generate` is the production orchestration boundary. It
accepts only a tenant-scoped VideoBrief ID, a catalog template key and an optional deterministic
seed. The API—not the browser—loads the Brief, BrandKit and ready asset details, converts
millisecond analysis ranges to 30 fps integer frames and invokes the pure compiler.

Manual Chinese labels and filenames are mapped to the stable tags used by the three templates;
speech segments retain transcript and word timing. Compilation warnings remain visible, while a
result with no usable clips is rejected instead of creating an empty project. Successful output
is persisted as immutable project revision one, and the response summarizes matched slots, used
assets and warnings for the workspace preview.

`GET /v1/video-project-templates` exposes the supported version, duration range and required tag
guidance. Both routes require the same server-owned identity boundary as the rest of the hotel
workspace.
