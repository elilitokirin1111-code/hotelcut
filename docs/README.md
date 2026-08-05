# HotelCut documentation

| Document                      | Purpose                               | Owning milestone |
| ----------------------------- | ------------------------------------- | ---------------- |
| `product-spec.md`             | MVP scope and product rules           | M0               |
| `architecture.md`             | Service and dependency boundaries     | M0               |
| `data-model.md`               | Planned business entities             | M1               |
| `timeline-schema.md`          | Renderer-independent project model    | M3               |
| `template-authoring.md`       | Template SDK rules                    | M3               |
| `automatic-editing.md`        | Compiler, scoring and manifest rules  | M4               |
| `editing.md`                  | Preview, edit commands and revisions  | M5               |
| `media-analysis.md`           | Upload and analysis pipeline          | M2               |
| `rendering.md`                | Renderer adapter and jobs             | M6               |
| `quality-control.md`          | Automated output checks               | M6               |
| `workspace.md`                | Tenant-scoped hotel workspace         | M7               |
| `opencut-integration.md`      | Future adapter boundary               | M8               |
| `security.md`                 | Tenant, upload and worker protections | Cross-cutting    |
| `deployment.md`               | Local and future deployment model     | M0+              |
| `acceptance-tests.md`         | Milestone gates                       | Cross-cutting    |
| `implementation-decisions.md` | Auditable architectural decisions     | Cross-cutting    |
| `ai-director/architecture.md` | AI Director boundaries and rollout    | AI Director 0+   |

Documents state their implementation status explicitly; M0 through M6 are implemented, M7 is in
progress, and the additive AI Director Phase 0 foundation is implemented behind feature flags.
