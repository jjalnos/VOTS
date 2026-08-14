import type { Metadata } from "next";
import { ChatExperience } from "@/components/chat-experience";
import { PageBanner } from "@/components/page-banner";
import { PublicShell } from "@/components/public-shell";
import { localeFrom } from "@/lib/i18n";

export const metadata: Metadata = { title: "Ask the archive / Consultar el archivo" };

export default async function ChatPage({ searchParams }: PageProps<"/chat">) {
  const locale = localeFrom((await searchParams).lang);
  return (
    <PublicShell locale={locale} path="/chat">
      <PageBanner
        eyebrow={locale === "es" ? "Guía citada para visitantes" : "Cited visitor guide"}
        title={locale === "es" ? "Consultar el archivo" : "Ask the archive"}
        description={
          locale === "es"
            ? "Las respuestas usan solo material publicado por curaduría. Si el archivo no respalda una respuesta, la guía lo dirá."
            : "Answers use only curator-published material. If the archive cannot support an answer, the guide will say so."
        }
      />
      <section className="section">
        <div className="content-wrap grid-2">
          <ChatExperience locale={locale} />
          <aside className="card">
            <p className="eyebrow">{locale === "es" ? "Límites claros" : "Clear boundaries"}</p>
            <h2>{locale === "es" ? "Lo que esta guía no hace" : "What this guide does not do"}</h2>
            <ul>
              <li>{locale === "es" ? "No busca en cargas privadas." : "It does not search private uploads."}</li>
              <li>{locale === "es" ? "No infiere identidades ni relaciones." : "It does not infer identities or relationships."}</li>
              <li>{locale === "es" ? "No presenta sugerencias como hechos." : "It does not present suggestions as facts."}</li>
              <li>{locale === "es" ? "No usa investigación externa en el chat público." : "It does not use external research in public chat."}</li>
            </ul>
          </aside>
        </div>
      </section>
    </PublicShell>
  );
}
