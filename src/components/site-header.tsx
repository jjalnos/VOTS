import Link from "next/link";
import type { Locale } from "@/lib/domain/types";
import { LogoutButton } from "@/components/logout-button";
import { t, withLocale } from "@/lib/i18n";

export function SiteHeader({
  locale,
  path = "/",
  signedIn = false,
  workspaceLinks = [],
}: {
  locale: Locale;
  path?: string;
  signedIn?: boolean;
  /** Private-workspace destinations, shown as a quiet second row when signed in. */
  workspaceLinks?: string[][];
}) {
  const navigation = [
    [t(locale, "navDirectory"), "/directory"],
    [t(locale, "navStories"), "/stories"],
    [t(locale, "navTimeline"), "/timeline"],
    [t(locale, "navChat"), "/chat"],
  ] as const;

  return (
    <header className="site-header">
      <div className="header-inner header-main">
        <Link className="brand" href={withLocale("/", locale)}>
          <span className="brand-name">Voices of the Shoah</span>
          <span className="brand-subtitle">{t(locale, "institutionName")}</span>
        </Link>
        <nav className="primary-nav" aria-label={locale === "es" ? "Navegación principal" : "Primary navigation"}>
          {navigation.map(([label, href]) => (
            <Link key={href} href={withLocale(href, locale)}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <nav className="language-switcher" aria-label={t(locale, "languageLabel")}>
            <Link
              href={withLocale(path, "en")}
              lang="en"
              hrefLang="en"
              aria-current={locale === "en" ? "page" : undefined}
            >
              EN
            </Link>
            <span className="language-rule" aria-hidden="true" />
            <Link
              href={withLocale(path, "es")}
              lang="es"
              hrefLang="es"
              aria-current={locale === "es" ? "page" : undefined}
            >
              ES
            </Link>
          </nav>
          {signedIn ? (
            <LogoutButton locale={locale} />
          ) : (
            <Link className="header-signin" href={withLocale("/login", locale)}>
              {t(locale, "signIn")}
            </Link>
          )}
        </div>
      </div>
      {workspaceLinks.length ? (
        <div className="header-inner">
          <nav
            className="workspace-nav"
            aria-label={locale === "es" ? "Navegación del espacio privado" : "Private workspace navigation"}
          >
            {workspaceLinks.map(([label, href]) => (
              <Link key={href} href={withLocale(href, locale)}>
                {label}
              </Link>
            ))}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
