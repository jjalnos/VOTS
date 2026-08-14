import type { Metadata } from "next";
import { ResearchForm } from "@/components/research-form";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireAction } from "@/lib/auth/server-session";
import { localeFrom } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Curator research", robots: { index: false, follow: false } };

export default async function CuratorResearchPage({ searchParams }: PageProps<"/curator/research">) {
  const locale = localeFrom((await searchParams).lang);
  const actor = await requireAction("run_external_research", "/curator/research");
  return <WorkspaceShell actor={actor} locale={locale} path="/curator/research" title={locale === "es" ? "Investigación externa" : "External research"} description={locale === "es" ? "Iniciada únicamente por curaduría. Los resultados nunca se incorporan ni publican automáticamente." : "Curator-initiated only. Results are never ingested or published automatically."}><section className="section"><div className="content-wrap grid-2"><div className="card"><ResearchForm locale={locale} /></div><aside className="card"><p className="eyebrow">{locale === "es" ? "Separación de proveedores" : "Provider separation"}</p><h2>{locale === "es" ? "Interno para archivo; OpenAI solo aquí" : "Internal for archive; OpenAI only here"}</h2><p>{locale === "es" ? "Extracción, coincidencias, traducción y chat usan el modelo interno. Si OpenAI se habilita, recibe únicamente la pregunta de investigación iniciada por curaduría, nunca cargas privadas." : "Extraction, matching, translation, and chat use the internal model. If OpenAI is enabled, it receives only the curator-initiated research question, never private uploads."}</p></aside></div></section></WorkspaceShell>;
}
