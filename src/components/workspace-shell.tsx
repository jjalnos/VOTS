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
 *
 * `path` names the sidebar destination the page belongs to. `switchPath` is
 * what the EN/ES links point at; it defaults to `path`, and a page whose URL
 * carries state (a detail route, a filtered list) passes its own URL here —
 * without any `lang` parameter, which the links add themselves — so changing
 * language never throws the reader back to the section's front door.
 */
export function WorkspaceShell({
  actor,
  locale,
  path,
  switchPath = path,
  title,
  description,
  children,
}: {
  actor: Actor;
  locale: Locale;
  path: string;
  switchPath?: string;
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
            <Link href={withLocale(switchPath, "en")} hrefLang="en" aria-current={locale === "en" ? "page" : undefined}>
              EN
            </Link>
            <span aria-hidden="true">|</span>
            <Link href={withLocale(switchPath, "es")} hrefLang="es" aria-current={locale === "es" ? "page" : undefined}>
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
