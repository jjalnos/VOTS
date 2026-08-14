import Link from "next/link";
import type { Locale } from "@/lib/domain/types";
import { t, withLocale } from "@/lib/i18n";

export function SiteHeader({ locale, path = "/" }: { locale: Locale; path?: string }) {
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
          <span>{t(locale, "curatorReviewed")}</span>
          <div className="utility-links">
            <Link href={withLocale("/family", locale)}>{t(locale, "navContribute")}</Link>
            <Link href={withLocale("/login", locale)}>{t(locale, "signIn")}</Link>
            <nav className="language-switcher" aria-label={t(locale, "languageLabel")}>
              <Link href={withLocale(path, "en")} aria-current={locale === "en"}>
                EN
              </Link>
              <Link href={withLocale(path, "es")} aria-current={locale === "es"}>
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
      </header>
    </>
  );
}
