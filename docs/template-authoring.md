# Template authoring

Status: M3 SDK and M4 product templates implemented.

Templates receive validated business input and media candidates. They return a validated,
renderer-independent `HotelVideoProject` and structured warnings.

## Definition

Create a template with `defineTemplate`:

```ts
const template = defineTemplate({
  id: 'hotel.room-selling-points',
  version: '1.0.0',
  generate(input, context) {
    return {
      project: buildProject(input, context),
      warnings: [],
    };
  },
});
```

The canonical input includes the project and hotel identity, immutable template reference,
brief snapshot, output settings, BrandKit tokens, safe areas, CTA, media candidates, metadata
and an unsigned 32-bit seed. The output contains schema version `1.0.0`, one validated project
and zero or more typed warnings.

`executeTemplate` validates input before invoking template code and validates the result
afterward. It also enforces matching project/hotel identity, template version and generation
seed. Failures identify the `input`, `generation` or `output` stage.

## Determinism contract

Template authors must derive every variable choice from the supplied context:

- `random()` returns a seeded deterministic fraction
- `integer(min, max)` returns a seeded inclusive integer
- `pick(values)` makes a seeded selection
- `id(namespace)` returns a deterministic UUID
- `inputHash` identifies canonical validated input

Do not call `Math.random()`, `Date.now()`, generate random UUIDs or read unordered external state
inside `generate`. Given the same validated input, template ID/version and seed, output must be
byte-equivalent after stable serialization.

## Author responsibilities

Each M4 template must:

- declare a stable identifier and semantic version
- use frame-aligned slot and source ranges
- place clips on compatible track kinds without same-track overlap
- use declared safe areas and typed BrandKit token references
- keep captions and CTA inside the project duration
- return warnings when media requirements cannot be met
- explain selection decisions through project metadata or warnings
- include fixed input and golden timeline fixtures

Initial product templates are host presentation with B-roll, room selling-point montage and
hotel promotion video. Templates never invoke renderers directly.

## Declarative M4 templates

Product templates use `defineCompilationTemplate`. A definition declares:

- stable ID, semantic version and supported duration range
- main/B-roll slot, role and basis-point frame range
- accepted media kinds, required/preferred tags and reuse policy
- A-roll keep-audio or B-roll/montage mute policy
- deterministic transition intent
- optional caption, title, CTA and music layouts

Slots on the same track cannot overlap. Basis points are resolved against the project duration,
then all downstream logic uses integer frames.

Implemented IDs:

- `hotel.host-broll`
- `hotel.room-montage`
- `hotel.promotion`

Changing slot timing, selection requirements or layout behavior requires a template version
bump and reviewed golden fixture changes.
