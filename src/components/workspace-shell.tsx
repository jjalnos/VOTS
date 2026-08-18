import type { Actor } from "@/lib/auth/policy";
import type { Locale } from "@/lib/domain/types";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { workspaceLinksFor } from "@/lib/auth/workspace-links";

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
  const links = workspaceLinksFor(actor, locale);

  return (
    <div lang={locale}>
      <SiteHeader locale={locale} path={path} signedIn workspaceLinks={links} />
      <main id="main-content" className="page-main">
        <section className="page-banner">
          <div className="content-wrap"><p className="eyebrow">{locale === "es" ? "No público" : "Not public"}</p><h1>{title}</h1><p>{description}</p></div>
        </section>
        {children}
      </main>
      <SiteFooter locale={locale} />
    </div>
  );
}
