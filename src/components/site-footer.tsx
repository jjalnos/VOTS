import Link from "next/link";
import type { Locale } from "@/lib/domain/types";
import { t, withLocale } from "@/lib/i18n";

export function SiteFooter({ locale }: { locale: Locale }) {
  const links = [
    [t(locale, "navDirectory"), "/directory"],
    [t(locale, "navStories"), "/stories"],
    [t(locale, "navTimeline"), "/timeline"],
    [t(locale, "navChat"), "/chat"],
  ] as const;

  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-identity">
          <span className="footer-wordmark">Voices of the Shoah</span>
          <span className="footer-line">
            {locale === "es"
              ? "Un comité de voluntarios del Museo Conmemorativo del Holocausto de San Antonio."
              : "A volunteer committee of the Holocaust Memorial Museum of San Antonio."}
          </span>
        </div>
        <nav className="footer-nav" aria-label={locale === "es" ? "Pie de página" : "Footer"}>
          {links.map(([label, href]) => (
            <Link key={href} href={withLocale(href, locale)}>
              {label}
            </Link>
          ))}
          <Link href={withLocale("/login", locale)}>{t(locale, "signIn")}</Link>
        </nav>
      </div>
      <div className="footer-colophon">
        <div className="content-wrap">
          <p>
            {locale === "es" ? "Donado por " : "Donated by "}
            <a href="https://clicksmith.net" target="_blank" rel="noreferrer">
              Clicksmith
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
