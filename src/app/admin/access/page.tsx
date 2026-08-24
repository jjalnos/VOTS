import type { Metadata } from "next";
import { AccessManager } from "@/components/access-manager";
import { WorkspaceShell } from "@/components/workspace-shell";
import { staffMfaRequired } from "@/lib/auth/mfa";
import { requireAction } from "@/lib/auth/server-session";
import { localeFrom } from "@/lib/i18n";
import { configuredDataAdapter, getArchiveRepository } from "@/lib/repository";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Access management",
  robots: { index: false, follow: false },
};

export default async function AdminAccessPage({ searchParams }: PageProps<"/admin/access">) {
  const locale = localeFrom((await searchParams).lang);
  const actor = await requireAction("manage_access", "/admin/access");
  const repository = getArchiveRepository();
  const [users, uploadContext] = await Promise.all([
    repository.adminUsers(actor),
    repository.uploadContext(actor),
  ]);
  const enforceStaffMfa = staffMfaRequired();
  const writable = configuredDataAdapter() === "postgres";

  return (
    <WorkspaceShell
      actor={actor}
      locale={locale}
      path="/admin/access"
      title={locale === "es" ? "Acceso y políticas" : "Access and policy"}
      description={
        locale === "es"
          ? "Invite personas, asigne roles y administre el estado de cada cuenta. Cada cambio queda registrado en la auditoría."
          : "Invite people, assign roles, and manage each account's state. Every change lands in the audit record."
      }
    >
      <section className="section">
        <div className="content-wrap">
          {!enforceStaffMfa ? (
            <p className="notice">
              {locale === "es"
                ? "MFA está desactivado temporalmente para esta vista previa. El personal todavía debe iniciar sesión con correo y contraseña."
                : "MFA is temporarily disabled for this preview. Staff must still sign in with email and password."}
            </p>
          ) : null}
          <AccessManager
            locale={locale}
            users={users}
            families={uploadContext.families.map((family) => ({ id: family.id, name: family.name }))}
            selfId={actor.userId}
            writable={writable}
          />
          <div className="grid-2" style={{ marginTop: "2rem" }}>
            <article className="card">
              <h2>{locale === "es" ? "Política de acceso" : "Access policy"}</h2>
              <p>
                {locale === "es"
                  ? "Administradores: acceso, políticas y cargas. Curadores: registros, revisión, investigación y publicación. Familias: contribución exclusiva a su grupo invitado. Visualización: registro de solo lectura con datos de contacto ocultos."
                  : "Admins: access, policy, and uploads. Curators: records, review, research, and publication. Families: contribution limited to their invited group. Viewers: read-only registry with contact details redacted."}
              </p>
            </article>
            <article className="card">
              <h2>{locale === "es" ? "Auditoría" : "Audit"}</h2>
              <p>
                {locale === "es"
                  ? "Invitaciones, cambios de estado, sesiones, cargas, decisiones y publicaciones se modelan como eventos de auditoría inmutables."
                  : "Invitations, state changes, sessions, uploads, decisions, and releases are modeled as immutable audit events."}
              </p>
            </article>
          </div>
        </div>
      </section>
    </WorkspaceShell>
  );
}
