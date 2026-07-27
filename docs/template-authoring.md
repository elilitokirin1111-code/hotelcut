# Template authoring

Status: contract target for M3 and M4.

Templates receive validated business input and media candidates. They return renderer-independent
timeline intent and warnings.

Each template must declare:

- stable identifier and semantic version
- validated input schema
- duration range and output format
- slots with required and preferred media tags
- safe areas and BrandKit tokens
- caption and CTA placement rules
- deterministic generation behavior
- unmet-requirement warnings

Initial template IDs are reserved for host presentation with B-roll, room selling-point montage
and hotel promotion video. Templates do not invoke renderers directly.
