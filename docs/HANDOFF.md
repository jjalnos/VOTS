# Voices of the Shoah — working handoff

Written 2026-08-17 for a machine that has not worked on this project before.
Read this top to bottom once; it is meant to get you productive in about
fifteen minutes.

---

## 1. What this is

**Voices of the Shoah (VOTS)** is the digital archive of the **Holocaust
Memorial Museum of San Antonio (HMMSA)**. VOTS itself is a *volunteer
committee* of HMMSA — not a separate brand. The committee meets periodically;
Jeremy Jalnos sits on it and Clicksmith builds the software.

The archive holds testimony from real survivors. Two people recur throughout
the code and content:

- **Sam Cohen** — Salonika, Greece; forced labor, escape, resistance; later
  San Antonio.
- **Stephan Jalnos** — Łódź Ghetto, resistance, Mauthausen; his story was
  shared by his son Robi in HMMSA's Survivor Speakers Series. **Jeremy is his
  grandson.**

This is not fixture data. Treat names, dates, photographs and copy with the
care you would want for your own family's record.

**Robin Long** (rllong36@gmail.com) is the museum's curator and the primary
user. She is writing books on Sam and Stephan and is building an oral history
of every survivor in the community. Phase 1 exists to serve her.

---

## 2. Where everything lives

| Thing | Location |
|---|---|
| Git repo | `https://github.com/jjalnos/VOTS.git` |
| Live site | `https://voicesoftheshoah.org` |
| Host | Cloudways **Velocity** app named `VOTS`, app id `6613146` |
| Cloudways console | `https://unified.cloudways.com/nodejs/6613146/overview` |
| Framework | Next.js 16 SSR, Node 24, PostgreSQL (Cloudways-managed) |
| DNS/CDN | Cloudflare (enterprise, via Cloudways) |

**Deployed branch is `main`.** Auto-deployment is ON, so a push to `main`
deploys automatically. `main` and `claude/robin-demo` are currently the same
commit (`a63372f`).

### Cloudways gotchas that cost real time

- The Cloudways session lived in **Chrome "Browser 2"**, not Browser 1. If the
  panel bounces you to a login screen, you are probably driving the wrong
  Chrome profile.
- The VOTS app is under **Velocity** in the left nav, not "Flexible".
- To change which branch deploys: Deployment Management → **Settings** tab →
  Branch dropdown → **Save & Redeploy**. The plain "Redeploy" button on the
  Deployments tab redeploys the current branch.
- Rolling back a bad deploy = switch the Branch dropdown to a known-good
  branch and redeploy. That is the fastest lever available.

---

## 3. Current state (as of 2026-08-17)

Live and working:

- **Public homepage** — the memorial design with the four-generation family
  photograph. No "coming soon", no staging banner, no demo framing.
- **Survivor registry** at `/curator/survivors` — all **317 people** from
  Robin's workbook, in PostgreSQL, organized by family and generation,
  searchable and filterable, with add/edit for curators.
- **Workbook upload** — Robin can upload an updated `.xlsx` herself. It shows
  a preview of what would change and writes nothing until she confirms.
- **Archive intake** at `/demo/robin/archive` — encrypted private uploads,
  quarantine, curator-invoked text clearance, and a citation-first assistant.
- **Read-only demo account** — `demo@voicesoftheshoah.org`. Sees the registry
  only; contact details are redacted; private archive returns 403. Password
  was emailed to the committee on 8/17 — **ask Jeremy, and rotate it**, since
  it now sits in eleven inboxes.

The site is `noindex, nofollow` and will stay that way until the museum
approves public indexing. `NEXT_PUBLIC_COMING_SOON=true` no longer gates the
homepage — it now controls **only** that robots tag (see `src/app/layout.tsx`).

---

## 4. Getting it running locally

Requires Node 20.9+ (production runs 24).

```bash
git clone https://github.com/jjalnos/VOTS.git
cd VOTS
npm install
cp .env.example .env.local
```

Then edit `.env.local` — for local work you want the mock/in-memory path, not
PostgreSQL:

```
DATA_ADAPTER=mock
AUTH_PROVIDER=development
DEV_AUTH_ENABLED=true
MEDIA_STORAGE_PROVIDER=local_mock
DEMO_ARCHIVE_STORE=memory
SURVIVOR_REGISTRY_STORE=memory
AUTH_SESSION_SECRET=<any 32+ random chars>
DEMO_ARCHIVE_MASTER_KEY=<any base64 32 bytes: openssl rand -base64 32>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

```bash
npm run dev        # http://localhost:3000
npm run lint
npm run typecheck
npm test           # 189 tests, all should pass
npm run build      # production build; also runs typecheck
```

**Development logins** (only when `DEV_AUTH_ENABLED=true`; they do not exist
in production):

- `curator@archive.local` / `curator-demo` — Robin's role
- `admin@archive.local` / `admin-demo`
- `family@archive.local` / `family-demo`
- `demo@voicesoftheshoah.org` / `shoah-archive-demo` — read-only viewer

---

## 5. Architecture orientation

```
src/app/                    routes
  page.tsx                  homepage -> components/archive-home.tsx
  curator/survivors/        THE SURVIVOR REGISTRY (main phase-1 deliverable)
  demo/robin/archive/       archive intake + assistant
  api/curator/registry/     registry read/write + /import for workbooks
  api/demo/archive/         encrypted upload, text clearance, assistant
src/lib/
  survivor-registry/        registry: types, store, postgres-store,
                            xlsx-reader, workbook-import, seed.json
  demo-archive/             encrypted intake: crypto, store, validation
  auth/                     policy (roles), bootstrap-curator, bootstrap-viewer
  startup.ts                migrations + bootstraps, run from instrumentation
drizzle/                    SQL migrations, applied at startup
```

**Roles** (`src/lib/auth/policy.ts`): `admin`, `curator`, `family`, `viewer`.
`viewer` is the shared demo account — it holds only `view_survivor_registry`.
Anything that edits requires `create_record`, which is MFA-gated, so an
unverified curator session also gets the redacted view.

**Registry storage** is chosen at runtime: `SURVIVOR_REGISTRY_STORE=memory`
for local dev, PostgreSQL whenever `DATABASE_URL` is present. Migration `0004`
creates the table; the 317 rows **seed lazily on first registry access** under
an advisory lock, so Robin's very first page load is slower than the rest.

---

## 6. Gotchas that will bite you

1. **Anything thrown from `src/lib/startup.ts` takes the whole site down.** It
   runs inside Next's `instrumentation.register()`. A mistyped demo password
   once put production into a crash loop for ~5 minutes. The viewer bootstrap
   is now wrapped in try/catch; the curator bootstrap is still fatal by design.
2. **`requestAnimationFrame` never fires in a background tab.** It was wrapping
   a fetch effect and left the archive library stuck on its loading skeleton
   forever. If you need a loading state, set it in the handler that triggers
   the refetch — that also satisfies `react-hooks/set-state-in-effect`.
3. **Excel dates arrive a century late.** Robin's workbook stores `6/10/25`
   meaning 1925; the importer pulls survivor birth years back 100 years when
   they land after 1945. See `correctCentury` in `workbook-import.ts`.
4. **Google Sheets writes whole numbers as `78255.0`** — strip the trailing
   `.0` or ZIP codes get a decimal point.
5. **Do not add the npm `xlsx` package.** The npm-published SheetJS builds
   carry a prototype-pollution advisory (CVE-2023-30533) and uploads are
   untrusted input. `src/lib/survivor-registry/xlsx-reader.ts` reads the format
   directly with `node:zlib`.
6. **Deceased status lives in cell formatting, not text.** Robin marks people
   with red ink. The reader maps red font colours to `deceased`, shown as ז״ל.
   A naive import silently loses this.
7. **macOS npm/TLS:** if npm fails with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`,
   prefix with `NODE_EXTRA_CA_CERTS=/etc/ssl/cert.pem`.
8. **Migrations are guarded by a test.** Adding one means updating the expected
   list in `tests/startup-safety.test.ts`, which is deliberate.

---

## 7. Open items

- **Rotate the demo password** and remove it from circulation once the
  committee has looked.
- **Robin's updated workbook** — she is sending a newer version. She can
  upload it herself at `/curator/survivors`; no code change needed.
- **Locale routing.** `?lang=es` cannot set `<html lang>` server-side, so
  Spanish pages still announce as English. The real fix is path-based locales
  (`/es/...`). Everything else i18n depends on this.
- **Demo vs product framing.** The archive intake still lives under
  `/demo/robin/*` while being the real upload desk. Worth promoting to
  `/curator/*`.
- **The cleanup ledger** — 189 reviewed findings across seven phases, with the
  ~25 already fixed struck through:
  `https://claude.ai/code/artifact/eae509b1-f948-4c70-817a-f3a23fe57b4a`
- **Roadmap agreed with the committee:** registry (done) → archive/"smart
  repo" → AI assistant → public-facing → possible museum kiosk.
- Feature requests from the committee go to **support@clicksmith.net**.

---

## 8. Deploy runbook

1. Land your work on `main` (auto-deployment picks it up), or use the panel's
   Branch dropdown to deploy a branch directly.
2. **Take a backup first** if the change touches the database — Cloudways →
   Backup & Restore → Take Backup Now. The app's first backup was taken
   2026-08-17; before that there were none.
3. Watch **Monitoring → Logs → Runtime Logs**. `Output` shows boot; `Error`
   shows startup failures. Benign drizzle `NOTICE` lines about "already
   exists, skipping" are normal and expected.
4. Verify: homepage loads, `/login` loads, private routes 307 to login,
   `/api/curator/registry` returns 401 when signed out.
5. If a deploy breaks the site: Branch dropdown → previous branch → redeploy.
