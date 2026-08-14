import Link from "next/link";
import type { Locale } from "@/lib/domain/types";
import { t, withLocale } from "@/lib/i18n";

export function ComingSoon({ locale }: { locale: Locale }) {
  return (
    <main id="main-content" className="coming-soon">
      <div className="coming-soon-grain" aria-hidden="true" />
      <header className="coming-soon-header">
        <div className="coming-soon-brand">
          <span className="brand-mark">HM</span>
          <span>
            <span className="brand-name">{t(locale, "institutionName")}</span>
            <span className="brand-subtitle">{t(locale, "archiveName")}</span>
          </span>
        </div>
        <nav className="language-switcher" aria-label={t(locale, "languageLabel")}>
          <Link href="/?lang=en" aria-current={locale === "en"}>EN</Link>
          <Link href="/?lang=es" aria-current={locale === "es"}>ES</Link>
        </nav>
      </header>
      <div className="coming-soon-content">
        <div className="coming-soon-rule" />
        <p className="eyebrow">HMMSA · San Antonio, Texas</p>
        <h1>{locale === "es" ? "Próximamente" : "Coming soon"}</h1>
        <p className="coming-soon-lead">
          {locale === "es"
            ? "Un nuevo archivo digital bilingüe, creado con cuidado para preservar voces, historias y fuentes aprobadas por el museo."
            : "A new bilingual digital archive, carefully created to preserve voices, stories, and museum-approved sources."}
        </p>
        <p className="collaboration-line">
          <span>{locale === "es" ? "HMMSA en colaboración con" : "HMMSA in collaboration with"}</span>
          <strong>Clicksmith</strong>
        </p>
      </div>
      <footer className="coming-soon-footer">
        <span>{locale === "es" ? "La memoria merece cuidado." : "Memory deserves care."}</span>
        <Link href={withLocale("/login", locale)}>{locale === "es" ? "Acceso privado" : "Private access"}</Link>
      </footer>
    </main>
  );
}
