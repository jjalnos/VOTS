# Architecture and policy boundaries

## Roles

- **Admin:** invitations, role assignment, account state, MFA policy, and audit access. Admin does not implicitly receive curator publication permission.
- **Curator:** survivor/family records, archive review, internal-AI suggestions, explicit external research, translation review, approved Markdown export, and publication.
- **Family contributor:** email/password access to exactly one invited family group; contribution only. Upload does not grant publication rights.

Staff actions require a session with `mfaVerified=true`. The local MFA verifier is an explicit development fixture. A production identity provider must replace it before staging acceptance.

## Publication boundary

Public pages call `buildPublicCatalog`. Inclusion requires all of the following: approved record state, a locale-specific `public_release` with `status=published` and a publication timestamp, approved source references, and public visibility for archive items. Public chat receives only that catalog. Withdrawal changes the release status; originals remain private.

## Data and storage

The Drizzle PostgreSQL schema models users, roles, families, memberships, survivors, relationships, archive items, file versions, extracted facts, sources, stories, timeline events, review decisions, public releases, chat sessions, audit events, and background jobs. Runtime development uses a mock repository; PostgreSQL wiring is present but production repository queries and migration execution are a deployment phase.

Original media uses `OriginalMediaStorage`. `LocalMockMediaStorage` is the only implementation and is disabled in production. A future Google Drive adapter may store originals temporarily without changing archive/file metadata. No Google credential or Drive call exists in this repository.

## AI separation

`InternalArchiveAIProvider` supports extraction, candidate matching, translation suggestions, and published-context chat. Configure an OpenAI-compatible self-hosted Hermes endpoint with `LOCAL_AI_BASE_URL` and `LOCAL_AI_MODEL`; otherwise the mock fallback runs. All archival outputs are suggestions and must be reviewed.

`ExternalResearchProvider` is a separate boundary. Only the curator POST route can invoke it after explicit confirmation. OpenAI is disabled unless `EXTERNAL_RESEARCH_PROVIDER=openai`, `OPENAI_EXTERNAL_RESEARCH_ENABLED=true`, a model is set, and a deployment key exists. The route sends the research question—not private uploads—and returns unapproved source suggestions.

## Production gates

Before any real content enters staging: complete the PostgreSQL repository, run reviewed migrations, integrate production identity/MFA, configure rate limits and CSRF protection for write endpoints, add malware scanning and larger-file streaming, define Google Drive retention/migration policy, persist audit events/jobs, complete museum legal/privacy review, and conduct an accessibility/security assessment.
