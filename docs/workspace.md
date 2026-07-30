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

The original seed identity was fictional, development-only, not persisted in browser storage and
visibly labeled as incomplete authentication.

## Slice 2: basic email session

The second slice replaces the Web seed-button identity with a real email/password session:

1. `POST /v1/auth/login` verifies the normalized email and scrypt password hash.
2. PostgreSQL stores only a digest of the opaque session token and its expiry.
3. The API returns the raw token only in an HttpOnly, SameSite cookie.
4. Protected routes resolve that cookie to an active user and inject the actor identity before
   tenant-scoped repository calls.
5. `GET /v1/auth/session` restores the Web session and `DELETE /v1/auth/session` revokes it.
6. The development header remains available only when explicitly allowed outside production.

The fictional seed account now exercises this formal boundary. It remains clearly labeled as
local-only data; production must disable seeding. Password reset, email verification, login rate
limiting and enterprise SSO remain later hardening or expansion work.

## Slice 3: hotel and BrandKit configuration

The third slice turns the first workspace module into a production-backed configuration flow:

1. Entering a selected hotel loads its tenant-scoped hotel detail and BrandKit.
2. An accessible hotel without a BrandKit receives editable client defaults but no database row
   until the operator explicitly saves.
3. Hotel profile and BrandKit forms save independently through the administrator-scoped
   `PATCH /v1/hotels/:id` and `PUT /v1/hotels/:hotelId/brand-kit` routes.
4. Successful hotel updates replace the selected hotel in the workspace snapshot so the header,
   search list and next entry use the persisted value.
5. BrandKit saving preserves an existing Logo asset reference. Logo selection remains disabled
   until the asset-library slice can expose only same-hotel assets and validate ownership.

The UI never accepts a raw Logo asset UUID. Contact and ending copy remain operator-supplied
facts; the application does not invent booking or contact claims.

## Slice 4: production video asset library

The fourth slice connects the hotel workspace to the complete M2 media pipeline:

1. The browser hashes videos incrementally and uploads presigned MinIO parts with bounded
   concurrency and visible phase progress.
2. Tenant-scoped production APIs list assets and load detail, analysis logs and signed
   derivatives.
3. The library filters by file name and processing state, polls only while work is active and
   refreshes the selected detail when analysis changes.
4. Operators can retry failed analysis and add manual time-range tags without replacing
   automatic scene, speech or VAD segments.
5. Upload and derivative URLs remain short-lived; direct storage requests do not receive the
   application session cookie.

Compose explicitly exposes the MinIO `ETag` response header to the configured Web origins because
multipart completion requires the exact server-returned value.

## Remaining M7 slices

- VideoBrief entry, template choice and production automatic compilation
- production video-project selection and Studio autosave adapter
- render submission, progress, retry and artifact downloads
- ownership-checked BrandKit Logo selection
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

Open `http://localhost:5173`, enter with the seed account, search for the fictional hotel, enter
its workspace, upload a video, wait for analysis and inspect its proxy or thumbnail.
