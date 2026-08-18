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
  /** Private-workspace destinations, shown beneath the public navigation. */
  workspaceLinks?: string[][];
}) {
  const navigation = [
    [t(locale, "navHome"), "/"],
    [t(locale, "navDirectory"), "/directory"],
    [t(locale, "navStories"), "/stories"],
    [t(locale, "navTimeline"), "/timeline"],
    [t(locale, "navChat"), "/chat"],
  ] as const;

  return (
    <>
      <div className="utility-bar">
        <div className="utility-inner">
          <span className="utility-identity">
            {locale === "es"
              ? "Voces de la Shoá · un comité de voluntarios de HMMSA"
              : "Voices of the Shoah · a volunteer committee of HMMSA"}
          </span>
          <div className="utility-links">
            {signedIn ? null : (
              <Link href={withLocale("/family", locale)}>{t(locale, "navContribute")}</Link>
            )}
            {signedIn ? (
              <LogoutButton locale={locale} />
            ) : (
              <Link href={withLocale("/login", locale)}>{t(locale, "signIn")}</Link>
            )}
            <nav className="language-switcher" aria-label={t(locale, "languageLabel")}>
              <Link
                href={withLocale(path, "en")}
                lang="en"
                hrefLang="en"
                aria-current={locale === "en" ? "page" : undefined}
              >
                EN
              </Link>
              <Link
                href={withLocale(path, "es")}
                lang="es"
                hrefLang="es"
                aria-current={locale === "es" ? "page" : undefined}
              >
                ES
              </Link>
            </nav>
          </div>
        </div>
      </div>
      <header className="site-header">
        <div className="header-inner">
          <Link className="brand" href={withLocale("/", locale)}>
            <span className="brand-mark" aria-hidden="true">
              HM
            </span>
            <span>
              <span className="brand-name">{t(locale, "institutionName")}</span>
              <span className="brand-subtitle">{t(locale, "archiveName")}</span>
            </span>
          </Link>
          <nav className="primary-nav" aria-label={locale === "es" ? "Navegación principal" : "Primary navigation"}>
            {navigation.map(([label, href]) => (
              <Link key={href} href={withLocale(href, locale)}>
                {label}
              </Link>
            ))}
          </nav>
        </div>
        {workspaceLinks.length ? (
          <div className="header-inner">
            <nav
              className="workspace-nav"
              aria-label={
                locale === "es"
                  ? "Navegación del espacio privado"
                  : "Private workspace navigation"
              }
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
    </>
  );
}
