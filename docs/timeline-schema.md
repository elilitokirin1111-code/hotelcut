# Timeline schema

Status: contract target for M3.

`HotelVideoProject` is the renderer-independent source of truth.

## Required top-level concepts

- semantic schema version
- project, hotel and immutable template version identifiers
- output format, duration and frame rate
- ordered tracks and clips
- captions
- audio mix
- resolved BrandKit tokens
- CTA data
- generation metadata including compiler version and seed

## Determinism

Fixed fixtures, compiler version, template version and seed must produce byte-equivalent
normalized project JSON. Time is represented as integer milliseconds or frame-aligned integer
values, never ambiguous floating-point seconds.

## Validation and migration

M3 must provide:

- JSON Schema
- TypeScript types
- Zod validation
- clear validation errors
- version migration functions
- Golden fixtures
- an OTIO export prototype

OTIO is an exchange format, not the HotelCut business database.
