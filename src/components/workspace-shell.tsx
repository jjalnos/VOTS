import Link from "next/link";
import type { Actor } from "@/lib/auth/policy";
import type { Locale } from "@/lib/domain/types";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { LogoutButton } from "@/components/logout-button";
import { withLocale } from "@/lib/i18n";

export function WorkspaceShell({
  actor,
  locale,
  path,
  title,
  description,
  children,
}: {
  actor: Actor;
  locale: Locale;
  path: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const links = actor.roles.includes("curator")
    ? [
        [locale === "es" ? "Archivo" : "Archive", "/curator/archive"],
        [locale === "es" ? "Cargar" : "Upload", "/curator/upload"],
        [locale === "es" ? "Revisar" : "Review", "/curator/review"],
        [locale === "es" ? "Investigar" : "Research", "/curator/research"],
        [locale === "es" ? "Publicar" : "Publish", "/curator/publish"],
      ]
    : actor.roles.includes("admin")
      ? [[locale === "es" ? "Acceso y políticas" : "Access & policy", "/admin/access"]]
      : [[locale === "es" ? "Contribución familiar" : "Family contribution", "/family"]];

  return (
    <>
      <SiteHeader locale={locale} path={path} />
      <div className="workspace-banner">
        <div className="content-wrap">
          <div className="workspace-bar">
            <div>
              <strong>{locale === "es" ? "Espacio privado" : "Private workspace"}</strong>
              <div>{actor.displayName} · {actor.roles.join(", ")}</div>
            </div>
            <LogoutButton locale={locale} />
          </div>
          <nav className="workspace-nav" aria-label={locale === "es" ? "Navegación del espacio privado" : "Private workspace navigation"}>
            {links.map(([label, href]) => <Link key={href} href={withLocale(href, locale)}>{label}</Link>)}
          </nav>
        </div>
      </div>
      <main id="main-content" className="page-main">
        <section className="page-banner">
          <div className="content-wrap"><p className="eyebrow">{locale === "es" ? "No público" : "Not public"}</p><h1>{title}</h1><p>{description}</p></div>
        </section>
        {children}
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
