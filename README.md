# HMMSA Digital Archive foundation

A bilingual English/Spanish Next.js and TypeScript foundation for The Holocaust Memorial Museum of San Antonio. The root route defaults to a static “Coming Soon” presentation for HMMSA in collaboration with Clicksmith; set `NEXT_PUBLIC_COMING_SOON=false` to reveal the completed public archive home.

## Local setup

Requirements: Node.js 20.9 or newer and npm.

1. Copy `.env.example` to ignored `.env.local` and replace development placeholders. Never commit `.env.local`.
2. Keep `DATA_ADAPTER=mock`, `MEDIA_STORAGE_PROVIDER=local_mock`, `AUTH_PROVIDER=development`, and `DEV_AUTH_ENABLED=true` for the local foundation.
3. Run `npm install`, then `npm run dev`.
4. Visit `http://localhost:3000`. Direct routes such as `/directory`, `/chat`, and `/login` remain available while the coming-soon page is active.

Development accounts exist only when `DEV_AUTH_ENABLED=true` outside production:

- `family@archive.local` / `family-demo`
- `curator@archive.local` / `curator-demo` / MFA `000000`
- `admin@archive.local` / `admin-demo` / MFA `000000`

These fixtures are intentionally rejected in production. The database identity adapter stores versioned scrypt password hashes, reloads active roles and accepted family membership on every request, and refuses staff access unless the configured MFA hook verifies the submitted code. Production still requires museum-controlled enrollment, invitations, password reset, and account-recovery workflows.

## PostgreSQL and production identity

Set `DATA_ADAPTER=postgres` to route public catalog, curator workspace, family workspace, access listing, exports, and private-upload metadata through PostgreSQL. The adapter applies the publication filters at both query and domain-policy layers; it never falls back to mock data after PostgreSQL is explicitly selected.

Set `AUTH_PROVIDER=database`, `DEV_AUTH_ENABLED=false`, and a random `AUTH_SESSION_SECRET` of at least 32 characters. Family accounts authenticate with their stored scrypt hash and exactly one accepted, non-revoked family membership. Admin and curator accounts additionally require `mfa_required=true`, an opaque `mfa_provider_reference`, and an HTTPS verification service configured with `MFA_PROVIDER=webhook` and `MFA_VERIFY_URL`.

The one-time `npm run auth:bootstrap-admin` command creates the first MFA-required administrator only when no administrator exists. It requires the explicit `BOOTSTRAP_CONFIRM=CREATE_INITIAL_ADMIN` guard and transient bootstrap variables documented in [Cloudways staging/production setup](docs/CLOUDWAYS.md). Build the command and review it locally; run it only in an approved maintenance window.

## Safety architecture

- Public catalog and chat are built from locale-specific `public_releases` plus only the approved sources referenced by those exact releases. Draft, private, unapproved, and unrelated-source sentinels are tested out of public results.
- Every upload requires survivor/family association, contributor/source, language, consent/rights, and audit metadata. It is forced to `private` and `pending`.
- The included media adapter writes development originals under ignored `.local-data/media`. The provider contract preserves a later Google Drive or object-storage swap; no Google SDK or credentials are used.
- Extraction, matching, translation suggestions, and public answer phrasing use a self-hosted OpenAI-compatible internal endpoint when configured. The mock fallback is deterministic and safe for development. Suggestions always require curator approval.
- OpenAI is isolated to explicit curator-initiated external research and remains disabled by default. Private uploads are not supplied to that provider.
- Obsidian support is export-only: the curator endpoint generates an approved Markdown research packet and has no sync behavior.
- Cookie-authenticated writes require an exact trusted `Origin`; production trusts the canonical `NEXT_PUBLIC_SITE_URL` and rejects missing or cross-site origins.

See [architecture and policy](docs/ARCHITECTURE.md) and [Cloudways staging/production setup](docs/CLOUDWAYS.md).

## Verification

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run db:generate
npm run build
```

Tests cover role/family boundaries, database-auth provider rules, MFA hooks, password hashing, publication isolation, repository invariants, private-by-default uploads, English/Spanish key parity, signed sessions, and release-specific citation behavior.
