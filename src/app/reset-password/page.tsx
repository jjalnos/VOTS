import type { Metadata } from "next";
import { PasswordResetForm } from "@/components/password-reset-form";
import { PublicShell } from "@/components/public-shell";
import { localeFrom } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export async function generateMetadata({
  searchParams,
}: PageProps<"/reset-password">): Promise<Metadata> {
  const locale = localeFrom((await searchParams).lang);
  return {
    title: locale === "es" ? "Restablecimiento de contraseña" : "Password reset",
    robots: { index: false, follow: false },
  };
}

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const params = await searchParams;
  const locale = localeFrom(params.lang);
  // An invitation link marks itself so a newcomer choosing their first
  // password is greeted as invited, not told to "reset" a password they
  // never had. The token semantics are identical either way.
  const invited = params.invited === "1";

  return (
    <PublicShell locale={locale} path="/reset-password">
      <section className="signin">
        <div className="signin-column">
          <h1>
            {invited
              ? locale === "es"
                ? "Elija su contraseña"
                : "Choose your password"
              : locale === "es"
                ? "Restablecimiento de contraseña"
                : "Password reset"}
          </h1>
          {invited ? (
            <p className="signin-note">
              {locale === "es"
                ? "Le damos la bienvenida al archivo Voices of the Shoah. Elija una contraseña para activar su cuenta."
                : "Welcome to the Voices of the Shoah archive. Choose a password to activate your account."}
            </p>
          ) : null}
          <span className="signin-rule" aria-hidden="true" />
          <PasswordResetForm locale={locale} />
        </div>
      </section>
    </PublicShell>
  );
}
