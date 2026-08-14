# Architecture and policy boundaries

## Roles

- **Admin:** invitations, role assignment, account state, MFA policy, and audit access. Admin does not implicitly receive curator publication permission.
- **Curator:** survivor/family records, archive review, internal-AI suggestions, explicit external research, translation review, approved Markdown export, and publication.
- **Family contributor:** email/password access to exactly one invited family group; contribution only. Upload does not grant publication rights.

Staff actions require an authorization actor with `mfaVerified=true`. During the temporary staging bypass (`STAFF_MFA_REQUIRED=false`), the server satisfies that policy only after successful password authentication and records that MFA was not enforced. Bypass sessions carry a false MFA claim, so setting `STAFF_MFA_REQUIRED=true` rejects them on their next request. With enforcement enabled, database staff authentication requires an HTTPS MFA verification hook using an opaque enrollment reference; missing or failed MFA configuration denies access.

## Publication boundary

Public pages call the configured repository and then `buildPublicCatalog`. Inclusion requires all of the following: approved record state, a locale-specific `public_release` with `status=published` and a publication timestamp, approved sources attached to that exact release, and public visibility for archive items. Releases for ineligible entities and unrelated sources are removed before public chat receives the catalog. Withdrawal changes the release status; originals remain private.

## Data and storage

The Drizzle PostgreSQL schema models users, roles, families, memberships, survivors, relationships, archive items, file versions, extracted facts, sources, stories, timeline events, review decisions, public releases, chat sessions, audit events, and background jobs. `ArchiveRepository` has mock and PostgreSQL implementations. The PostgreSQL implementation powers public, curator, family, admin, export, and upload-metadata reads/writes, with upload records, file versions, and audit events committed in one database transaction. Migration execution remains a controlled deployment operation.

Original media uses `OriginalMediaStorage`. `LocalMockMediaStorage` is the only implementation and is disabled in production. A future Google Drive adapter may store originals temporarily without changing archive/file metadata. No Google credential or Drive call exists in this repository.

## AI separation

`InternalArchiveAIProvider` supports extraction, candidate matching, translation suggestions, and published-context chat. Configure an OpenAI-compatible self-hosted Hermes endpoint with `LOCAL_AI_BASE_URL` and `LOCAL_AI_MODEL`; otherwise the mock fallback runs. All archival outputs are suggestions and must be reviewed.

`ExternalResearchProvider` is a separate boundary. Only the curator POST route can invoke it after explicit confirmation. OpenAI is disabled unless `EXTERNAL_RESEARCH_PROVIDER=openai`, `OPENAI_EXTERNAL_RESEARCH_ENABLED=true`, a model is set, and a deployment key exists. The route sends the research question—not private uploads—and returns unapproved source suggestions.

## Production gates

Before any real content enters staging: run reviewed migrations and the controlled initial-admin bootstrap, connect the museum MFA verification service, implement audited invitation/password-reset administration, add distributed rate limits and defense-in-depth CSRF tokens beyond the existing strict cookie/origin checks, add malware scanning and larger-file streaming, replace local mock media storage, persist the background queue, complete museum legal/privacy review, and conduct an accessibility/security assessment.
