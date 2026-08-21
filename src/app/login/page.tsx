import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/login-form";
import { PublicShell } from "@/components/public-shell";
import { localeFrom, withLocale } from "@/lib/i18n";
import { staffMfaRequired } from "@/lib/auth/mfa";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Sign in / Iniciar sesión",
  robots: { index: false, follow: false },
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const locale = localeFrom((await searchParams).lang);
  const showDevelopmentHint =
    process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_ENABLED === "true";
  const requireStaffMfa = staffMfaRequired();

  return (
    <PublicShell locale={locale} path="/login">
      <section className="signin">
        <div className="signin-column">
          <h1>{locale === "es" ? "Iniciar sesión" : "Sign in"}</h1>
          <span className="signin-rule" aria-hidden="true" />
          <LoginForm
            locale={locale}
            requireStaffMfa={requireStaffMfa}
            showDevelopmentHint={showDevelopmentHint}
          />
          <p className="signin-note">
            {locale === "es"
              ? "El acceso es para familias y personal del museo. Las contribuciones permanecen privadas hasta una decisión curatorial explícita."
              : "Access is for families and museum staff. Contributions stay private until an explicit curator decision."}
          </p>
          <Link className="signin-back" href={withLocale("/", locale)}>
            ← {locale === "es" ? "Volver al archivo" : "Back to the archive"}
          </Link>
        </div>
      </section>
    </PublicShell>
  );
}
