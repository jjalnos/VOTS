# Cloudways staging and production handoff

No deployment or Cloudways change is performed by this repository work.

## Staging

1. Create a dedicated staging Node.js application and use the Cloudways native PostgreSQL connection already provisioned for that application. Do not reuse a production database or superuser.
2. In Cloudways deployment settings, use Node.js 20.9+ and configure build command `npm ci && npm run build` and start command `npm run start`.
3. Store sensitive variables using Cloudways’ Sensitive option. Compose `DATABASE_URL` from Cloudways’ generated host, port, database, username, and password. Do not commit or paste those values into tickets or chat. Set `DATABASE_SSL` to the mode Cloudways documents for the internal connection.
4. Set `DATA_ADAPTER=postgres`, `DEV_AUTH_ENABLED=false`, a long random `AUTH_SESSION_SECRET`, and `NEXT_PUBLIC_COMING_SOON=true` until museum acceptance.
5. Configure the production identity/MFA adapter before allowing any login. The repository’s demo credentials are unavailable in production.
6. Run and review database migrations during a controlled maintenance step. Back up before every schema change.
7. Configure the self-hosted internal AI endpoint on a private network path. Do not make it public without authentication, network controls, logging policy, and resource limits.
8. Leave external OpenAI research disabled until the museum approves source policy, data handling, budget, and model configuration.

## Production

Use a separate production application, PostgreSQL database/user, storage location, secrets, internal AI instance, and audit/job infrastructure. Enable Cloudways backups and confirm restore procedures. Terminate TLS at the platform, set the canonical `NEXT_PUBLIC_SITE_URL`, validate security headers and cookies, disable the coming-soon flag only after curatorial acceptance, and run the complete verification suite against the release candidate.

Cloudways’ Node.js guidance says database credentials are managed in the application Database section and warns that passwords must remain private; deployment environment variables can be marked Sensitive. Never export Cloudways credentials to repository files.
