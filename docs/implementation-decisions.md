# Implementation decisions

## ID-001: Isolated repository inside the operations workspace

- Date: 2026-07-27
- Status: accepted
- Decision: create `hotelcut/` as a standalone repository under the existing multi-project
  operations directory.
- Reason: the parent directory contains unrelated projects and is not an empty repository.
- Impact: HotelCut tooling and Git history cannot affect sibling projects.

## ID-002: Create shared packages only in their owning milestone

- Date: 2026-07-27
- Status: accepted
- Decision: M0 creates the package boundary and ownership map but no empty domain packages.
- Reason: empty or fabricated implementations obscure milestone status.
- Impact: M1 and later create packages together with tested contracts.

## ID-003: Health boundaries before business dependencies

- Date: 2026-07-27
- Status: accepted
- Decision: M0 API readiness verifies the process, the analysis worker verifies Redis, and the
  render worker exposes BullMQ connection state.
- Reason: database repositories and domain persistence belong to M1.
- Impact: API dependency readiness expands in M1.

## ID-004: Docker Desktop program and WSL data on D drive

- Date: 2026-07-27
- Status: accepted
- Decision: install Docker Desktop at `D:\HotelCut\DockerDesktop` and configure its WSL data root
  as `D:\HotelCut\DockerData\wsl`.
- Reason: the user explicitly requested Docker installation and data placement on D.
- Impact: Windows optional features must be enabled and the first WSL engine initialization may
  require a system restart.

## ID-005: Moving MinIO tags are local-only

- Date: 2026-07-27
- Status: temporary
- Decision: use official `latest` MinIO server and client tags for the local M0 stack.
- Reason: M0 has no production environment, and the official images simplify first boot.
- Impact: pin image digests before any shared staging deployment.

## ID-006: BullMQ queue names use hyphens

- Date: 2026-07-27
- Status: accepted
- Decision: use `hotelcut-render` as the initial render queue name.
- Reason: BullMQ rejects queue names containing colons.
- Impact: future queue names follow the same hyphenated convention and are covered by contract
  tests.

## ID-007: Tenant scope is enforced by repository queries

- Date: 2026-07-27
- Status: accepted
- Decision: join every tenant-owned read to membership and require owner or admin membership for
  hotel and BrandKit administration.
- Reason: route-only authorization can be bypassed by future workers or internal callers.
- Impact: unauthorized and cross-tenant resource access returns the same not-found result and
  does not disclose existence.

## ID-008: BrandKit is one-to-one with Hotel

- Date: 2026-07-27
- Status: accepted
- Decision: store `hotel_id` as a unique BrandKit foreign key. Keep `logo_asset_id` nullable and
  unenforced until the M2 asset lifecycle is active.
- Reason: this avoids a cyclic Hotel/BrandKit dependency and permits brand setup before uploads.
- Impact: M2 must validate logo ownership before assigning the soft reference and may add the
  database foreign key in a follow-up migration.

## ID-009: Development identity is explicit and local-only

- Date: 2026-07-27
- Status: temporary
- Decision: M1 accepts a UUID in the `x-user-id` header and seeds one fictional owner.
- Reason: persistence and tenant isolation can be completed without pulling SSO/JWT work into M1.
- Impact: the header must not be treated as production authentication and will be replaced by
  verified identity middleware in the authentication milestone.

## ID-010: Compose bootstraps persistence before API startup

- Date: 2026-07-27
- Status: accepted
- Decision: an idempotent `db-bootstrap` service applies Drizzle migrations and optionally loads
  fictional development data before the API starts.
- Reason: one-command development startup must work from an empty volume.
- Impact: production deployment will run migrations as a controlled release job and disable
  development seed data.
