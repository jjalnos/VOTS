import type { Metadata } from "next";
import { ResearchForm } from "@/components/research-form";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireAction } from "@/lib/auth/server-session";
import { localeFrom } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Curator research",
  robots: { index: false, follow: false },
};

export default async function CuratorResearchPage({
  searchParams,
}: PageProps<"/curator/research">) {
  const locale = localeFrom((await searchParams).lang);
  const actor = await requireAction(
    "run_external_research",
    "/curator/research",
  );
  return (
    <WorkspaceShell
      actor={actor}
      locale={locale}
      path="/curator/research"
      title={locale === "es" ? "Investigación externa" : "External research"}
      description={
        locale === "es"
          ? "Iniciada únicamente por curaduría. Los resultados nunca se incorporan ni publican automáticamente."
          : "Curator-initiated only. Results are never ingested or published automatically."
      }
    >
      <section className="section">
        <div className="content-wrap grid-2">
          <div className="card">
            <ResearchForm locale={locale} />
          </div>
          <aside className="card">
            <p className="eyebrow">
              {locale === "es"
                ? "Separación de proveedores"
                : "Provider separation"}
            </p>
            <h2>
              {locale === "es"
                ? "El archivo interno es gratuito; OpenAI pagado solo aquí"
                : "Internal archive work is no-cost; paid OpenAI only here"}
            </h2>
            <p>
              {locale === "es"
                ? "El Asistente del Archivo, la extracción, las coincidencias y la traducción no usan tokens pagados de OpenAI. Esta herramienta externa sí puede hacerlo, por lo que exige una nueva confirmación de costo antes de cada búsqueda. Solo recibe la pregunta iniciada por curaduría, nunca cargas privadas."
                : "The Archive Assistant, extraction, matching, and translation do not use paid OpenAI tokens. This external tool can, so it requires a fresh cost confirmation before every search. It receives only the curator-initiated question, never private uploads."}
            </p>
          </aside>
        </div>
      </section>
    </WorkspaceShell>
  );
}
