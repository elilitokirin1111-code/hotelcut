# Security

## Tenant isolation

Organization and hotel access are verified for every read and write. Storage keys, signed upload
URLs, projects, BrandKits and artifacts must not cross tenant boundaries.

M1 performs membership joins inside PostgreSQL repository queries. Unauthorized resource reads
return not found so callers cannot use response differences to enumerate other tenants. The
`x-user-id` development header is not authentication and must never be enabled as a production
trust boundary.

## Uploads and media tools

- Signed upload URLs are short-lived.
- Extension alone never determines file type.
- ffprobe validates uploaded media.
- File and project size limits are enforced.
- Untrusted values are passed as process arguments, never interpolated into shell commands.
- Workers use isolated temporary directories and clean them after completion.

## Secrets and logging

Cookies, tokens, signed URLs and storage secrets are excluded from logs. `.env` files are ignored,
and checked-in values are local-only examples.

## External services

External AI services use provider contracts and mocks in tests. The MVP does not store platform
credentials, bypass verification or automate platform login.

## Test data

Tests use fictional hotel data and legally distributable, minimal media fixtures.
