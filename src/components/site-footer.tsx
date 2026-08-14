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
              ? "Base de desarrollo. El logotipo oficial, las fotografías y los registros reales se incorporarán únicamente con aprobación y documentación de derechos."
              : "Development foundation. Official logo, photography, and real records will be added only with approval and documented rights."}
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
