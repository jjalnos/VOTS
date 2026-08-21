# Security and secrets handoff

This is the operator handoff for credentials and archive encryption material. It records the intended production control plane; it does not claim that Google Secret Manager integration already exists in the application runtime.

## Control plane

- **Production source of truth:** keep each production value as a versioned secret in Google Cloud Secret Manager. Google recommends least privilege, version-number pinning instead of the `latest` alias for production, rotation by adding a new version, and disabling a version before destroying it. See [Secret Manager best practices](https://cloud.google.com/secret-manager/docs/best-practices) and [rotation recommendations](https://cloud.google.com/secret-manager/docs/rotation-recommendations).
- **Cloudways runtime projection:** add only the version selected for a deployment to the Cloudways Velocity environment and enable **Sensitive**. Cloudways documents that a Sensitive value is hidden after it is saved and cannot be viewed again, although it can be removed. This is a deployment environment feature; this handoff does not describe it as a vault or assume unlisted lifecycle, audit, or rotation guarantees. See [Cloudways Velocity environment variables](https://support.cloudways.com/en/articles/15550368-how-to-launch-a-velocity-application-on-cloudways).
- **Workload identity:** if the runtime reads Secret Manager directly, use a dedicated workload identity. Google prefers Workload Identity Federation for workloads outside Google Cloud and recommends avoiding service-account keys when a more secure alternative is available. Grant only `roles/secretmanager.secretAccessor`, on each exact secret rather than at project level, to the dedicated application identity. See [Secret Manager authentication](https://cloud.google.com/secret-manager/docs/authentication), [workload identities](https://cloud.google.com/iam/docs/workload-identities), and [Secret Manager access control](https://cloud.google.com/secret-manager/docs/access-control).
- **Current Cloudways constraint:** do not assume that the Cloudways runtime supplies a compatible federated identity. Validate that separately before implementing direct retrieval. Until then, an authorized deployer projects a pinned Secret Manager version into a Cloudways Sensitive variable. If a service-account key is unavoidable, it is itself a high-value secret, must be narrowly scoped and rotated, and is a temporary fallback—not the preferred design.

## Secret inventory

Names are safe to document; values are not.

| Purpose | Runtime name(s) | Handoff rule |
| --- | --- | --- |
| Database access | `DATABASE_URL` | Separate staging and production credentials; rotate with a tested cutover. |
| Session signing | `AUTH_SESSION_SECRET` | Generate independently per environment; expect existing sessions to require replacement after rotation. |
| MFA verification | `MFA_VERIFY_BEARER_TOKEN` | Restrict to the server-side verification integration. |
| Private archive encryption | `DEMO_ARCHIVE_MASTER_KEY`, `DEMO_ARCHIVE_KEY_VERSION` | Treat every key version as retained decryption material until all ciphertext using it has been re-encrypted and verified. |
| Self-hosted AI authentication | `LOCAL_AI_AUTH_TOKEN` | Grant access only to the internal model endpoint. |
| Paid external research | `OPENAI_API_KEY` | Server-side external-research path only; rotate independently of the internal AI service. |
| Usage alerts | `SMTP_USER`, `SMTP_PASSWORD` (Cloudways Elastic Email) or legacy `RESEND_API_KEY` | Keep the selected provider's credential server-side and restrict it to the approved sending identity and alert workflow. Project SMTP credentials as Cloudways Sensitive values. `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_REQUIRE_TLS`, and `SMTP_FROM` are configuration rather than secret payloads. |
| Bootstrap credentials | `BOOTSTRAP_*_PASSWORD`, bootstrap confirmation values | One-time use only; remove from Cloudways and redeploy immediately after successful bootstrap. |

## Rotation runbook

1. Add a new Secret Manager version; do not overwrite the previous value.
2. Record the selected numeric version in the change ticket without recording its payload. Test the pinned version in staging.
3. Project that version into the corresponding Cloudways Sensitive variable, then redeploy or restart as the component requires.
4. Verify authentication, database access, alerting, and restore/decrypt checks relevant to the changed secret. Roll back by selecting the prior known-good version if validation fails.
5. Remove or disable the old credential in the upstream system only after every consumer has moved. Disable the old Secret Manager version before considering destruction.
6. Never destroy an archive encryption-key version while any archive row or backup depends on it. Cloud KMS documents the underlying invariant: destroying a key version makes data encrypted with that version undecryptable. See [Cloud KMS key rotation](https://cloud.google.com/kms/docs/key-rotation) and [key-version destruction risks](https://cloud.google.com/kms/docs/destroy-restore).

The current demo archive stores a numeric key version with each encrypted blob but resolves only one `DEMO_ARCHIVE_MASTER_KEY` at runtime. Therefore, **do not rotate this key in place yet**. Before the first archive-key rotation, implement and test either a version-to-secret resolver that can read every retained key version or a complete, verified re-encryption migration with backup recovery. Keep the old Secret Manager version enabled until that work proves no ciphertext or retained backup needs it.

## Exposure and audit rules

- No secret may use a `NEXT_PUBLIC_` name or be passed into a Client Component. Next.js documents that `NEXT_PUBLIC_` variables are inlined into browser JavaScript at build time. See [Next.js environment variables](https://nextjs.org/docs/pages/guides/environment-variables).
- Never place secret payloads in source control, `.env.example`, API responses, rendered HTML, screenshots, tickets, chat, application logs, deployment logs, telemetry, or alert bodies. Log only the secret identifier, numeric version, operation result, and actor/service identity.
- For Elastic Email, verify `voicesoftheshoah.org` before use and restrict the application sender to `no-reply@voicesoftheshoah.org`. Create a dedicated SMTP credential with a username matching `vots-smtp-<8-to-32-character-unique-suffix>@voicesoftheshoah.org` rather than reusing an account-wide API key. Use `smtp.elasticemail.com:2525` with `SMTP_SECURE=false` and `SMTP_REQUIRE_TLS=true`, which requires a STARTTLS upgrade. The application pins these transport settings so an environment edit cannot redirect the SMTP password to another host. Never weaken TLS to diagnose delivery; use the provider dashboard and redacted status information instead.
- Do not log complete environment objects, authorization headers, request headers, provider responses, or exception objects that might carry credentials.
- Enable and review Secret Manager Data Access audit logs for `AccessSecretVersion`; Google classifies secret payload access as a Data Read operation, and Data Access logs generally require explicit enablement. See [Secret Manager audit logging](https://cloud.google.com/secret-manager/docs/audit-logging) and [Cloud Audit Logs](https://cloud.google.com/logging/docs/audit).
- Separate duties: the runtime identity reads only named secrets; the rotation identity can add versions but does not run the application; destructive version actions require an approved change and proof that no retained data depends on the version.

## Release gate

Before production content is accepted, identify the owner for each secret, provision separate staging and production secrets, test a rollback, test database restore plus archive decryption, confirm bootstrap values are absent, confirm no secret is browser-bundled or logged, and document the next rotation date. Production is not ready while the archive key has only an unverified single-version recovery path.
