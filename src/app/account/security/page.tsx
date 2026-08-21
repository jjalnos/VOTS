import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PasswordChangeForm } from "@/components/password-change-form";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getActor } from "@/lib/auth/server-session";
import { localeFrom } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Account security / Seguridad de la cuenta",
  robots: { index: false, follow: false },
};

export default async function AccountSecurityPage({
  searchParams,
}: PageProps<"/account/security">) {
  const locale = localeFrom((await searchParams).lang);
  const actor = await getActor();
  if (!actor) {
    const returnTo = locale === "es"
      ? "/account/security?lang=es"
      : "/account/security";
    redirect("/login?returnTo=" + encodeURIComponent(returnTo));
  }

  return (
    <WorkspaceShell
      actor={actor}
      locale={locale}
      path="/account/security"
      title={locale === "es" ? "Seguridad de la cuenta" : "Account security"}
      description={
        locale === "es"
          ? "Cambie su propia contraseña y cierre todas las sesiones existentes."
          : "Change your own password and revoke every existing session."
      }
    >
      <section className="section">
        <div className="content-wrap grid-2">
          <article className="card">
            <p className="eyebrow">{locale === "es" ? "Contraseña" : "Password"}</p>
            <h2>{locale === "es" ? "Elegir una nueva contraseña" : "Choose a new password"}</h2>
            <p>
              {locale === "es"
                ? "Confirme su contraseña actual. La nueva contraseña debe tener entre 16 y 200 caracteres."
                : "Confirm your current password. The new password must contain 16 to 200 characters."}
            </p>
            <PasswordChangeForm locale={locale} />
          </article>

          <aside className="card">
            <p className="eyebrow">{locale === "es" ? "Qué sucederá" : "What happens next"}</p>
            <h2>{locale === "es" ? "Todas las sesiones se cerrarán" : "Every session will be signed out"}</h2>
            <p>
              {locale === "es"
                ? "Después del cambio, esta sesión y cualquier otra sesión abierta dejarán de ser válidas. Inicie sesión de nuevo con la nueva contraseña."
                : "After the change, this session and every other open session become invalid. Sign in again with the new password."}
            </p>
            <div className="notice">
              {locale === "es"
                ? "Este formulario nunca coloca contraseñas en la dirección de la página ni en el almacenamiento del navegador."
                : "This form never places passwords in the page address or browser storage."}
            </div>
          </aside>
        </div>
      </section>
    </WorkspaceShell>
  );
}
