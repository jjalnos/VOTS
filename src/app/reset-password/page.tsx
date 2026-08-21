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
  const locale = localeFrom((await searchParams).lang);

  return (
    <PublicShell locale={locale} path="/reset-password">
      <section className="signin">
        <div className="signin-column">
          <h1>{locale === "es" ? "Restablecimiento de contraseña" : "Password reset"}</h1>
          <span className="signin-rule" aria-hidden="true" />
          <PasswordResetForm locale={locale} />
        </div>
      </section>
    </PublicShell>
  );
}
