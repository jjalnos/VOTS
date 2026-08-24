import type { Locale } from "@/lib/domain/types";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getActor } from "@/lib/auth/server-session";
import { workspaceHomeFor } from "@/lib/auth/workspace-links";

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
  // one button back to their workspace and sign-out, not an invitation to
  // sign in.
  const actor = await getActor();
  return (
    <div lang={locale}>
      <SiteHeader
        locale={locale}
        path={path}
        signedIn={Boolean(actor)}
        workspaceHref={workspaceHomeFor(actor)}
      />
      <main id="main-content" className="page-main">
        {children}
      </main>
      <SiteFooter locale={locale} />
    </div>
  );
}
