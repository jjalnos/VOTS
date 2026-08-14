# Cloudways staging and production handoff

These instructions deliberately omit database passwords, API keys, MFA tokens, and media credentials. Keep every secret in Cloudways Sensitive variables and never copy it into repository files, build logs, tickets, or chat.

## Staging

1. Create a dedicated staging Node.js application and use the Cloudways native PostgreSQL connection already provisioned for that application. Do not reuse a production database or superuser.
2. In Cloudways deployment settings, select **Next.js SSR**, **npm**, Node.js 20.9+, build command `npm run build`, and entry command `npx next start`. Cloudways performs the dependency-install step separately.
3. Store sensitive variables using Cloudways’ Sensitive option. Compose `DATABASE_URL` from Cloudways’ generated host, port, database, username, and password. Do not commit or paste those values into tickets or chat. Set `DATABASE_SSL` to the mode Cloudways documents for the internal connection.
4. Set `DATA_ADAPTER=postgres`, `AUTH_PROVIDER=database`, `DEV_AUTH_ENABLED=false`, a random `AUTH_SESSION_SECRET` of at least 32 characters, the exact HTTPS `NEXT_PUBLIC_SITE_URL`, and `NEXT_PUBLIC_COMING_SOON=true` until museum acceptance. The site URL is also the trusted origin for authenticated writes. An explicitly selected PostgreSQL adapter fails closed; it does not fall back to fixtures.
5. Configure `MFA_PROVIDER=webhook`, an HTTPS `MFA_VERIFY_URL`, and its Sensitive bearer token before allowing staff login. The hook receives only `{ userId, providerReference, code }` and must return `{ "verified": true }` for success. Family contributors do not call the MFA hook.
6. Run and review `npm run db:migrate` during a controlled maintenance step. Back up before every schema change. Do not run migration generation on the server.
7. Create the first administrator only once, after MFA enrollment exists. Supply `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_DISPLAY_NAME`, `BOOTSTRAP_ADMIN_PASSWORD`, and the opaque `BOOTSTRAP_ADMIN_MFA_REFERENCE` transiently, set `BOOTSTRAP_CONFIRM=CREATE_INITIAL_ADMIN`, and run `npm run auth:bootstrap-admin`. Remove every bootstrap variable immediately afterward. The command refuses to run when an administrator already exists and does not print the password or hash.
8. Configure the self-hosted internal AI endpoint on a private network path. Do not make it public without authentication, network controls, logging policy, and resource limits.
9. Leave external OpenAI research disabled until the museum approves source policy, data handling, budget, and model configuration.

## Production

Use a separate production application, PostgreSQL database/user, storage location, secrets, internal AI instance, and audit/job infrastructure. Enable Cloudways backups and confirm restore procedures. Terminate TLS at the platform, set the canonical `NEXT_PUBLIC_SITE_URL`, validate security headers and cookies, disable the coming-soon flag only after curatorial acceptance, and run the complete verification suite against the release candidate.

Cloudways’ Node.js guidance says database credentials are managed in the application Database section and warns that passwords must remain private; deployment environment variables can be marked Sensitive. Never export Cloudways credentials to repository files.
