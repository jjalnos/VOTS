import type { Metadata } from "next";
import { StatusPill } from "@/components/status-pill";
import { WorkspaceShell } from "@/components/workspace-shell";
import { staffMfaRequired } from "@/lib/auth/mfa";
import { requireAction } from "@/lib/auth/server-session";
import { localeFrom } from "@/lib/i18n";
import { getArchiveRepository } from "@/lib/repository";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Access management",
  robots: { index: false, follow: false },
};

export default async function AdminAccessPage({ searchParams }: PageProps<"/admin/access">) {
  const locale = localeFrom((await searchParams).lang);
  const actor = await requireAction("manage_access", "/admin/access");
  const users = await getArchiveRepository().adminUsers(actor);
  const enforceStaffMfa = staffMfaRequired();

  return (
    <WorkspaceShell
      actor={actor}
      locale={locale}
      path="/admin/access"
      title={locale === "es" ? "Acceso y políticas" : "Access and policy"}
      description={locale === "es" ? "Administrar invitaciones, roles y estado de cuenta." : "Manage invitations, roles, and account state."}
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
          <p className="notice" style={{ marginTop: enforceStaffMfa ? 0 : "1rem" }}>
            {locale === "es"
              ? "Las escrituras administrativas permanecen deshabilitadas hasta completar el flujo auditado de invitaciones."
              : "Administrative writes remain disabled until the audited invitation workflow is complete."}
          </p>
          <div className="data-table-wrap" style={{ marginTop: "2rem" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{locale === "es" ? "Cuenta" : "Account"}</th>
                  <th>{locale === "es" ? "Roles" : "Roles"}</th>
                  <th>MFA</th>
                  <th>{locale === "es" ? "Estado" : "Status"}</th>
                  <th>{locale === "es" ? "Acción" : "Action"}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const isStaff = user.roles.some((role) => role === "admin" || role === "curator");
                  const mfaLabel = isStaff && !enforceStaffMfa
                    ? (locale === "es" ? "Temporalmente desactivado" : "Temporarily off")
                    : user.mfaRequired
                      ? (locale === "es" ? "Requerido" : "Required")
                      : (locale === "es" ? "Solo contraseña" : "Password only");

                  return (
                    <tr key={user.id}>
                      <td><strong>{user.displayName}</strong><br />{user.email}</td>
                      <td>{user.roles.join(", ")}</td>
                      <td><StatusPill tone={isStaff && enforceStaffMfa && user.mfaRequired ? "approved" : "pending"}>{mfaLabel}</StatusPill></td>
                      <td><StatusPill>{user.active ? (locale === "es" ? "Activo" : "Active") : (locale === "es" ? "Inactivo" : "Inactive")}</StatusPill></td>
                      <td><button className="button secondary" type="button" disabled>{locale === "es" ? "Editar" : "Edit"}</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="grid-2" style={{ marginTop: "2rem" }}>
            <article className="card">
              <h2>{locale === "es" ? "Política de acceso" : "Access policy"}</h2>
              <p>{locale === "es" ? "Administradores: acceso y políticas. Curadores: registros, revisión, investigación y publicación. Familias: contribución exclusiva a su grupo invitado." : "Admins: access and policy. Curators: records, review, research, and publication. Families: contribution limited to their invited group."}</p>
            </article>
            <article className="card">
              <h2>{locale === "es" ? "Auditoría" : "Audit"}</h2>
              <p>{locale === "es" ? "Cambios de rol, sesiones, cargas, decisiones y publicaciones se modelan como eventos de auditoría inmutables." : "Role changes, sessions, uploads, decisions, and releases are modeled as immutable audit events."}</p>
            </article>
          </div>
        </div>
      </section>
    </WorkspaceShell>
  );
}
