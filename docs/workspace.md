# Hotel workspace

Status: M7 in progress.

## Scope

M7 turns the completed domain, media, project, editor and rendering capabilities into a
tenant-scoped hotel customer workflow. It includes:

- login and identity
- hotel discovery and selection
- hotel and BrandKit configuration
- asset library
- video projects
- render center
- operation audit
- basic quotas

## Slice 1: workspace entry

The first slice implements the development path described in the product plan:

1. The login page clearly offers the fictional database seed account.
2. The client sends that actor identity to `GET /v1/organizations` and `GET /v1/hotels`.
3. Shared Zod contracts validate both responses before data reaches the UI.
4. The operator can search by hotel, city or organization and enter one selected workspace.
5. Every later module receives the selected hotel as its tenant boundary.

The Web app uses a same-origin `/api` path. Vite proxies it to `http://localhost:3000` on the host
and `HOTELCUT_API_PROXY_TARGET=http://api:3000` in Compose. This keeps local browser requests
same-origin without weakening the API with broad development CORS.

## Security boundary

The client does not decide which organizations or hotels the actor may see. PostgreSQL
membership joins in the repository remain the source of truth, and inaccessible hotel resources
continue to return 404. Search and selection operate only on the already tenant-filtered API
response.

The seed identity is not formal authentication. It is:

- fictional
- development-only
- not persisted in browser storage
- visibly labeled as incomplete authentication

M7 must add basic email authentication before this path can be considered suitable for real
hotel customers. Complex enterprise SSO remains outside the MVP.

## Remaining M7 slices

- basic email login and server-owned session identity
- editable hotel and BrandKit configuration
- asset upload, analysis status, filtering and manual tagging
- production video-project selection and Studio autosave adapter
- render submission, progress, retry and artifact downloads
- operation audit
- basic quotas and quota failure states
- end-to-end cross-tenant tests for assets, projects, artifacts, BrandKit and upload URLs

## Local verification

```sh
docker compose up -d --build web
pnpm --filter @hotelcut/web typecheck
pnpm --filter @hotelcut/web test
pnpm --filter @hotelcut/web build
```

Open `http://localhost:5173`, enter with the seed account, search for the fictional hotel and
enter its workspace.
