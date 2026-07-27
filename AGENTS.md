# HotelCut agent instructions

## Required reading

Before changing code, read `README.md` and the relevant documents in `docs/`.

## Milestone discipline

- Work in dependency order: M0 through M8.
- Do not enter a later milestone until the current milestone acceptance criteria pass.
- Keep changes small, reviewable, tested and reversible.
- Do not expand the MVP when requirements conflict. Record the decision in
  `docs/implementation-decisions.md`.
- Update tests and README documentation with each completed milestone.

## Architecture boundaries

- Business data uses HotelCut-owned schemas.
- Remotion, FFmpeg and future OpenCut types must not leak into the domain model.
- Long-running analysis and rendering work belongs in queues and workers.
- External AI capabilities must use provider interfaces and support mocks.
- Generated results must be explainable, editable and retryable.
- OpenCut support remains an adapter contract until an official stable API exists.

## Scope exclusions

Do not add digital humans, voice cloning, AI video generation, social publishing, platform
scraping, booking integrations, livestream editing, a professional free-form timeline, plugin
marketplaces or real-time collaboration during the MVP.

## Quality gate

Run and report:

1. `pnpm format:check`
2. `pnpm lint`
3. `pnpm typecheck`
4. `pnpm test`
5. `pnpm test:integration`
6. `pnpm build`

Never remove valid assertions to pass tests. Do not use unexplained `any`, `@ts-ignore`,
embedded secrets or fabricated completion claims.
