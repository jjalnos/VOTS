import type { Actor } from "@/lib/auth/policy";
import type { Locale } from "@/lib/domain/types";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";
import { withLocale } from "@/lib/i18n";
import Link from "next/link";

/**
 * The private workspace: navigation down the side, work in the middle.
 *
 * The public site's header and footer are deliberately absent. This is a desk,
 * not a page of the archive, and the person using it needs the whole width for
 * the register in front of them.
 */
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
  const es = locale === "es";

  return (
    <div className="workspace" lang={locale}>
      <WorkspaceSidebar actor={actor} locale={locale} path={path} />
      <div className="workspace-body">
        <header className="workspace-topbar">
          <div>
            <p className="eyebrow">{es ? "No público" : "Not public"}</p>
            <h1>{title}</h1>
          </div>
          <nav className="workspace-locale" aria-label={es ? "Idioma" : "Language"}>
            <Link href={withLocale(path, "en")} hrefLang="en" aria-current={locale === "en" ? "page" : undefined}>
              EN
            </Link>
            <span aria-hidden="true">|</span>
            <Link href={withLocale(path, "es")} hrefLang="es" aria-current={locale === "es" ? "page" : undefined}>
              ES
            </Link>
          </nav>
        </header>
        <main id="main-content" className="workspace-main">
          <p className="workspace-lede">{description}</p>
          {children}
        </main>
      </div>
    </div>
  );
}
