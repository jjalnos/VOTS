import Link from "next/link";
import type { Locale } from "@/lib/domain/types";
import { t, withLocale } from "@/lib/i18n";

export function SiteFooter({ locale }: { locale: Locale }) {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div>
          <p className="eyebrow">{t(locale, "archiveName")}</p>
          <h2>{t(locale, "institutionName")}</h2>
          <p className="footer-note">
            {locale === "es"
              ? "Voces de la Shoá es un comité de voluntarios del Museo Conmemorativo del Holocausto de San Antonio."
              : "Voices of the Shoah is a volunteer committee of the Holocaust Memorial Museum of San Antonio."}
          </p>
        </div>
        <div>
          <p>
            <Link href={withLocale("/chat", locale)}>{t(locale, "navChat")}</Link>
          </p>
          <p>
            <Link href={withLocale("/login", locale)}>{t(locale, "privateWorkspace")}</Link>
          </p>
          <p className="footer-note">{t(locale, "onlyPublished")}</p>
        </div>
      </div>
    </footer>
  );
}
