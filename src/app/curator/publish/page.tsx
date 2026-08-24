import type { Metadata } from "next";
import { StatusPill } from "@/components/status-pill";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireAction } from "@/lib/auth/server-session";
import { localeFrom } from "@/lib/i18n";
import { getArchiveRepository } from "@/lib/repository";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Publication desk",
  robots: { index: false, follow: false },
};

export default async function CuratorPublishPage({
  searchParams,
}: PageProps<"/curator/publish">) {
  const locale = localeFrom((await searchParams).lang);
  const actor = await requireAction("publish_content", "/curator/publish");
  const workspace = await getArchiveRepository().curatorWorkspace(actor);
  const approvedSurvivors = workspace.survivors.filter(
    (survivor) => survivor.reviewStatus === "approved",
  );
  return (
    <WorkspaceShell
      actor={actor}
      locale={locale}
      path="/curator/publish"
      title={locale === "es" ? "Mesa de publicación" : "Publication desk"}
      description={
        locale === "es"
          ? "La publicación exige contenido aprobado, fuentes aprobadas, traducción revisada y una instantánea de derechos."
          : "Publication requires approved content, approved sources, reviewed translation, and a rights snapshot."
      }
    >
      <section className="section">
        <div className="content-wrap">
          <div className="grid-2">
            <div className="card">
              <p className="eyebrow">
                {locale === "es" ? "Lista de control" : "Release checklist"}
              </p>
              <h2>
                {locale === "es"
                  ? "Cuatro bloqueos obligatorios"
                  : "Four required gates"}
              </h2>
              <ol>
                <li>
                  {locale === "es"
                    ? "Revisión de contenido aprobada"
                    : "Content review approved"}
                </li>
                <li>
                  {locale === "es"
                    ? "Todas las fuentes aprobadas"
                    : "Every source approved"}
                </li>
                <li>
                  {locale === "es"
                    ? "Traducción revisada para este idioma"
                    : "Translation reviewed for this locale"}
                </li>
                <li>
                  {locale === "es"
                    ? "Derechos y consentimiento registrados"
                    : "Rights and consent recorded"}
                </li>
              </ol>
            </div>
            <div className="card">
              <p className="eyebrow">Obsidian</p>
              <h2>
                {locale === "es"
                  ? "Exportar; nunca sincronizar"
                  : "Export; never sync"}
              </h2>
              <p>
                {locale === "es"
                  ? "El paquete Markdown contiene solo hechos y fuentes aprobados."
                  : "The Markdown packet contains only approved facts and sources."}
              </p>
              <form
                className="stack-form"
                method="post"
                action="/api/exports/research-packet"
              >
                <label className="field-label" htmlFor="research-survivor">
                  {locale === "es" ? "Registro aprobado" : "Approved record"}
                </label>
                <select className="control" id="research-survivor" name="survivorId" required>
                  {approvedSurvivors.map((survivor) => (
                    <option key={survivor.id} value={survivor.id}>
                      {survivor.displayName[locale]}
                    </option>
                  ))}
                </select>
                <input type="hidden" name="locale" value={locale} />
                <button
                  className="button"
                  type="submit"
                  disabled={!approvedSurvivors.length}
                >
                  {locale === "es"
                    ? "Descargar paquete aprobado"
                    : "Download approved packet"}
                </button>
              </form>
            </div>
          </div>
          <div className="data-table-wrap" style={{ marginTop: "2rem" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{locale === "es" ? "Entidad" : "Entity"}</th>
                  <th>{locale === "es" ? "Idioma" : "Locale"}</th>
                  <th>{locale === "es" ? "Estado" : "Status"}</th>
                  <th>{locale === "es" ? "Publicado" : "Published"}</th>
                </tr>
              </thead>
              <tbody>
                {workspace.releases.map((release) => (
                  <tr key={release.id}>
                    <td>
                      {release.entityType}
                      <br />
                      <small>
                        {workspace.survivors.find(
                          (survivor) => survivor.id === release.entityId,
                        )?.displayName[locale] ?? release.entityId}
                      </small>
                    </td>
                    <td>{release.locale.toUpperCase()}</td>
                    <td>
                      <StatusPill>{release.status}</StatusPill>
                    </td>
                    <td>{release.publishedAt ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </WorkspaceShell>
  );
}
