import type { Metadata } from "next";
import Link from "next/link";
import { PasswordResetRequestForm } from "@/components/password-reset-request-form";
import { PublicShell } from "@/components/public-shell";
import { localeFrom, withLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export async function generateMetadata({
  searchParams,
}: PageProps<"/forgot-password">): Promise<Metadata> {
  const locale = localeFrom((await searchParams).lang);
  return {
    title: locale === "es" ? "Restablecer contraseña" : "Forgot password",
    robots: { index: false, follow: false },
  };
}

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  const locale = localeFrom((await searchParams).lang);

  return (
    <PublicShell locale={locale} path="/forgot-password">
      <section className="signin">
        <div className="signin-column">
          <h1>{locale === "es" ? "Restablecer contraseña" : "Reset your password"}</h1>
          <span className="signin-rule" aria-hidden="true" />
          <p className="signin-intro">
            {locale === "es"
              ? "Ingresa el correo de tu cuenta y te enviaremos un enlace seguro."
              : "Enter your account email and we’ll send you a secure reset link."}
          </p>
          <PasswordResetRequestForm locale={locale} />
          <Link className="signin-back signin-secondary-link" href={withLocale("/login", locale)}>
            ← {locale === "es" ? "Volver a iniciar sesión" : "Back to sign in"}
          </Link>
        </div>
      </section>
    </PublicShell>
  );
}
