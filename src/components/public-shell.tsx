import type { Locale } from "@/lib/domain/types";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getActor } from "@/lib/auth/server-session";
import { workspaceLinksFor } from "@/lib/auth/workspace-links";

export async function PublicShell({
  locale,
  path,
  children,
}: {
  locale: Locale;
  path: string;
  children: React.ReactNode;
}) {
  // A signed-in curator reading a public page still gets their own header:
  // their workspace destinations and sign-out, not an invitation to sign in.
  const actor = await getActor();
  return (
    <div lang={locale}>
      <SiteHeader
        locale={locale}
        path={path}
        signedIn={Boolean(actor)}
        workspaceLinks={workspaceLinksFor(actor, locale)}
      />
      <main id="main-content" className="page-main">
        {children}
      </main>
      <SiteFooter locale={locale} />
    </div>
  );
}
