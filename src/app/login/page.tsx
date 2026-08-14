import type { Metadata } from "next";
import { LoginForm } from "@/components/login-form";
import { PageBanner } from "@/components/page-banner";
import { PublicShell } from "@/components/public-shell";
import { localeFrom } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Private access / Acceso privado", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const locale = localeFrom((await searchParams).lang);
  const showDevelopmentHint = process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_ENABLED === "true";
  return (
    <PublicShell locale={locale} path="/login">
      <PageBanner
        eyebrow={locale === "es" ? "Acceso por invitación" : "Invitation-only access"}
        title={locale === "es" ? "Espacio de archivo privado" : "Private archival workspace"}
        description={locale === "es" ? "Las familias usan correo y contraseña. El personal administrativo y curatorial también debe completar MFA." : "Families use email and password. Administrative and curatorial staff must also complete MFA."}
      />
      <section className="section">
        <div className="content-wrap grid-2">
          <div className="card"><LoginForm locale={locale} showDevelopmentHint={showDevelopmentHint} /></div>
          <aside className="card">
            <p className="eyebrow">{locale === "es" ? "Privacidad" : "Privacy"}</p>
            <h2>{locale === "es" ? "El acceso no implica publicación" : "Access does not mean publication"}</h2>
            <p>{locale === "es" ? "Las contribuciones familiares permanecen privadas. Solo una decisión curatorial explícita puede crear una versión pública." : "Family contributions remain private. Only an explicit curator decision can create a public release."}</p>
          </aside>
        </div>
      </section>
    </PublicShell>
  );
}
