import type { Locale } from "@/lib/domain/types";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export function PublicShell({
  locale,
  path,
  children,
}: {
  locale: Locale;
  path: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader locale={locale} path={path} />
      <main id="main-content" className="page-main">
        {children}
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
