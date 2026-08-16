import type { Metadata } from "next";
import Link from "next/link";
import { PublicShell } from "@/components/public-shell";
import { localeFrom, withLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Not authorized / Sin autorización",
  robots: { index: false, follow: false },
};

export default async function UnauthorizedPage({
  searchParams,
}: PageProps<"/unauthorized">) {
  const params = await searchParams;
  const locale = localeFrom(params.lang);
  return (
    <PublicShell locale={locale} path="/unauthorized">
      <section className="page-banner">
        <div className="content-wrap">
          <p className="eyebrow">
            {locale === "es" ? "Límite de acceso" : "Access boundary"}
          </p>
          <h1>{locale === "es" ? "Sin autorización" : "Not authorized"}</h1>
          <p>
            {locale === "es"
              ? "Esta cuenta no tiene permiso para ese espacio de trabajo o grupo familiar. Si cree que es un error, escriba al museo desde la cuenta invitada."
              : "This account does not have permission for that workspace or family group. If this looks wrong, contact the museum from the invited account."}
          </p>
        </div>
      </section>
      <section className="section">
        <div className="content-wrap" style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <Link className="button" href={withLocale("/", locale)}>
            {locale === "es" ? "Volver al inicio" : "Return home"}
          </Link>
          <Link className="button" href={withLocale("/login", locale)}>
            {locale === "es" ? "Entrar con otra cuenta" : "Sign in with a different account"}
          </Link>
        </div>
      </section>
    </PublicShell>
  );
}
