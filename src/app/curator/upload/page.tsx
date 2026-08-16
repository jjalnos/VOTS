import type { Metadata } from "next";
import { UploadForm } from "@/components/upload-form";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireAction } from "@/lib/auth/server-session";
import { localeFrom } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Curator upload",
  robots: { index: false, follow: false },
};

export default async function CuratorUploadPage({
  searchParams,
}: PageProps<"/curator/upload">) {
  const locale = localeFrom((await searchParams).lang);
  const actor = await requireAction("create_record", "/curator/upload");
  return (
    <WorkspaceShell
      actor={actor}
      locale={locale}
      path="/curator/upload"
      title={locale === "es" ? "Carga curatorial" : "Curator upload"}
      description={
        locale === "es"
          ? "Asocie cada original con una familia o sobreviviente y documente sus derechos."
          : "Associate every original with a family or survivor and document its rights."
      }
    >
      <section className="section">
        <div className="content-wrap grid-2">
          <div className="card">
            <UploadForm locale={locale} />
          </div>
          <aside className="card">
            <p className="eyebrow">Checklist</p>
            <h2>{locale === "es" ? "Antes de cargar" : "Before upload"}</h2>
            <ul>
              <li>
                {locale === "es"
                  ? "Confirme la asociación familiar."
                  : "Confirm the family association."}
              </li>
              <li>
                {locale === "es"
                  ? "Registre fuente y colaborador."
                  : "Record source and contributor."}
              </li>
              <li>
                {locale === "es"
                  ? "Documente consentimiento y restricciones."
                  : "Document consent and restrictions."}
              </li>
              <li>
                {locale === "es"
                  ? "No coloque archivos públicos en esta etapa."
                  : "Do not make files public at this stage."}
              </li>
            </ul>
          </aside>
        </div>
      </section>
    </WorkspaceShell>
  );
}
