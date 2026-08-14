# HMMSA Digital Archive foundation

A bilingual English/Spanish Next.js and TypeScript foundation for The Holocaust Memorial Museum of San Antonio. The root route defaults to a static “Coming Soon” presentation for HMMSA in collaboration with Clicksmith; set `NEXT_PUBLIC_COMING_SOON=false` to reveal the completed public archive home.

## Local setup

Requirements: Node.js 20.9 or newer and npm.

1. Copy `.env.example` to ignored `.env.local` and replace development placeholders. Never commit `.env.local`.
2. Keep `DATA_ADAPTER=mock`, `MEDIA_STORAGE_PROVIDER=local_mock`, and `DEV_AUTH_ENABLED=true` for the local foundation.
3. Run `npm install`, then `npm run dev`.
4. Visit `http://localhost:3000`. Direct routes such as `/directory`, `/chat`, and `/login` remain available while the coming-soon page is active.

Development accounts exist only when `DEV_AUTH_ENABLED=true` outside production:

- `family@archive.local` / `family-demo`
- `curator@archive.local` / `curator-demo` / MFA `000000`
- `admin@archive.local` / `admin-demo` / MFA `000000`

These fixtures are intentionally rejected in production. Production requires a real identity adapter, secure password storage for invited families, MFA enrollment/verification for staff, a long random `AUTH_SESSION_SECRET`, PostgreSQL, and durable audit persistence.

## Safety architecture

- Public catalog and chat are built from locale-specific `public_releases` plus approved sources. Draft, private, and unapproved sentinels are tested out of public results.
- Every upload requires survivor/family association, contributor/source, language, consent/rights, and audit metadata. It is forced to `private` and `pending`.
- The included media adapter writes development originals under ignored `.local-data/media`. The provider contract preserves a later Google Drive or object-storage swap; no Google SDK or credentials are used.
- Extraction, matching, translation suggestions, and public answer phrasing use a self-hosted OpenAI-compatible internal endpoint when configured. The mock fallback is deterministic and safe for development. Suggestions always require curator approval.
- OpenAI is isolated to explicit curator-initiated external research and remains disabled by default. Private uploads are not supplied to that provider.
- Obsidian support is export-only: the curator endpoint generates an approved Markdown research packet and has no sync behavior.

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

Tests cover role/family boundaries, MFA-gated permissions, publication isolation, private-by-default uploads, English/Spanish key parity, signed sessions, and citation/refusal behavior.
