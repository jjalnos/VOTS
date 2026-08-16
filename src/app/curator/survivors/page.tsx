import type { Metadata } from "next";
import { Fragment } from "react";
import Link from "next/link";
import { WorkspaceShell } from "@/components/workspace-shell";
import { RegistryPersonEditor } from "@/components/registry-person-editor";
import { requireAction } from "@/lib/auth/server-session";
import type { Locale } from "@/lib/domain/types";
import { localeFrom } from "@/lib/i18n";
import { getSurvivorRegistryStore } from "@/lib/survivor-registry/store";
import {
  REGISTRY_GENERATIONS,
  type RegistryGeneration,
  type RegistryListInput,
  type RegistryPerson,
} from "@/lib/survivor-registry/types";
import styles from "./survivors.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Survivor registry / Registro de sobrevivientes",
  robots: { index: false, follow: false },
};

interface RegistryCopy {
  title: string;
  description: string;
  kicker: string;
  heading: string;
  intro: string;
  searchLabel: string;
  searchPlaceholder: string;
  generationLabel: string;
  statusLabel: string;
  allGenerations: string;
  allStatuses: string;
  living: string;
  deceased: string;
  apply: string;
  clear: string;
  addPerson: string;
  totals: { people: string; survivors: string; families: string; remembered: string };
  columns: { name: string; generation: string; family: string; origin: string; camps: string; contact: string };
  edit: string;
  close: string;
  emptyTitle: string;
  emptyBody: string;
  familyFilterOn: (family: string) => string;
  zalLegend: string;
  pageOf: (page: number, total: number) => string;
  previous: string;
  next: string;
  matches: string;
  sourceNote: string;
}

const GENERATION_LABELS: Record<RegistryGeneration, Record<Locale, string>> = {
  survivor: { en: "Survivor", es: "Sobreviviente" },
  "survivor-spouse": { en: "Survivor's spouse", es: "Cónyuge de sobreviviente" },
  "2nd-gen": { en: "2nd generation", es: "2.ª generación" },
  "2nd-gen-spouse": { en: "2nd gen spouse", es: "Cónyuge 2.ª gen" },
  "3rd-gen": { en: "3rd generation", es: "3.ª generación" },
  "3rd-gen-spouse": { en: "3rd gen spouse", es: "Cónyuge 3.ª gen" },
  "4th-gen": { en: "4th generation", es: "4.ª generación" },
  "4th-gen-spouse": { en: "4th gen spouse", es: "Cónyuge 4.ª gen" },
  indirect: { en: "Indirect", es: "Indirecto" },
  "indirect-spouse": { en: "Indirect spouse", es: "Cónyuge indirecto" },
  contact: { en: "Contact", es: "Contacto" },
  unclassified: { en: "Unclassified", es: "Sin clasificar" },
};

function copyFor(locale: Locale): RegistryCopy {
  if (locale === "es") {
    return {
      title: "Registro de sobrevivientes",
      description:
        "La lista de trabajo de Robin: cada sobreviviente y descendiente, organizada por familia y generación.",
      kicker: "Registro vivo",
      heading: "Cada nombre, en su familia.",
      intro:
        "Busque, corrija y amplíe el registro. Los cambios quedan guardados en el archivo privado; nada aquí se publica.",
      searchLabel: "Buscar en el registro",
      searchPlaceholder: "Nombre, familia, país, campo…",
      generationLabel: "Generación",
      statusLabel: "Estado",
      allGenerations: "Todas las generaciones",
      allStatuses: "Todos",
      living: "Con vida",
      deceased: "Fallecidos (ז״ל)",
      apply: "Filtrar",
      clear: "Limpiar filtros",
      addPerson: "Añadir persona",
      totals: {
        people: "Personas",
        survivors: "Sobrevivientes",
        families: "Familias",
        remembered: "ז״ל",
      },
      columns: {
        name: "Nombre",
        generation: "Generación",
        family: "Familia",
        origin: "Origen",
        camps: "Campos / destino",
        contact: "Contacto",
      },
      edit: "Editar",
      close: "Cerrar",
      emptyTitle: "Ninguna persona coincide con estos filtros.",
      emptyBody: "Ajuste la búsqueda o limpie los filtros para ver el registro completo.",
      familyFilterOn: (family) => `Mostrando la familia ${family}`,
      zalLegend:
        "ז״ל — de bendita memoria. Importado de la convención de tinta roja del cuaderno de Robin.",
      pageOf: (page, total) => `Página ${page} de ${total}`,
      previous: "Anterior",
      next: "Siguiente",
      matches: "Coincidencias",
      sourceNote:
        "Importado del libro de trabajo de Robin (317 personas). La versión definitiva llegará antes de producción.",
    };
  }
  return {
    title: "Survivor registry",
    description:
      "Robin's working list: every survivor and descendant, organized by family and generation.",
    kicker: "Living register",
    heading: "Every name, within its family.",
    intro:
      "Search, correct, and grow the register. Changes stay in the private archive; nothing here is published.",
    searchLabel: "Search the register",
    searchPlaceholder: "Name, family, country, camp…",
    generationLabel: "Generation",
    statusLabel: "Status",
    allGenerations: "All generations",
    allStatuses: "Everyone",
    living: "Living",
    deceased: "Of blessed memory (ז״ל)",
    apply: "Filter",
    clear: "Clear filters",
    addPerson: "Add a person",
    totals: {
      people: "People",
      survivors: "Survivors",
      families: "Families",
      remembered: "ז״ל",
    },
    columns: {
      name: "Name",
      generation: "Generation",
      family: "Family",
      origin: "Origin",
      camps: "Camps / fate",
      contact: "Contact",
    },
    edit: "Edit",
    close: "Close",
    emptyTitle: "No one matches these filters.",
    emptyBody: "Adjust the search or clear the filters to see the full register.",
    familyFilterOn: (family) => `Showing the ${family} family`,
    zalLegend:
      "ז״ל — of blessed memory. Imported from the red-ink convention in Robin's workbook.",
    pageOf: (page, total) => `Page ${page} of ${total}`,
    previous: "Previous",
    next: "Next",
    matches: "Matches",
    sourceNote:
      "Imported from Robin's workbook (317 people). The definitive version arrives before production.",
  };
}

function listInputFrom(params: Record<string, string | string[] | undefined>): RegistryListInput {
  const value = (key: string): string => {
    const raw = params[key];
    return typeof raw === "string" ? raw.trim() : "";
  };
  const generation = value("generation");
  const status = value("status");
  const page = Number(value("page"));
  return {
    query: value("q").slice(0, 160),
    generation: (REGISTRY_GENERATIONS as readonly string[]).includes(generation)
      ? (generation as RegistryGeneration)
      : "all",
    family: value("family").slice(0, 160) || "all",
    status: status === "living" || status === "deceased" ? status : "all",
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: 25,
  };
}

function registryHref(
  input: RegistryListInput,
  locale: Locale,
  overrides: Partial<RegistryListInput & { person: string; add: boolean }> = {},
  expanded?: { person?: string; add?: boolean },
): string {
  const merged = { ...input, ...overrides };
  const params = new URLSearchParams();
  if (merged.query) params.set("q", merged.query);
  if (merged.generation !== "all") params.set("generation", merged.generation);
  if (merged.family !== "all") params.set("family", merged.family);
  if (merged.status !== "all") params.set("status", merged.status);
  if (merged.page > 1) params.set("page", String(merged.page));
  if (expanded?.person) params.set("person", expanded.person);
  if (expanded?.add) params.set("add", "1");
  params.set("lang", locale);
  return `/curator/survivors?${params.toString()}`;
}

function contactSummary(person: RegistryPerson): string {
  return person.email || person.phone || (person.city ? `${person.city}, ${person.state}` : "");
}

function NameCell({ person }: { person: RegistryPerson }) {
  return (
    <span className={styles.name}>
      {person.title ? `${person.title} ` : ""}
      {person.firstName} {person.lastName}
      {person.deceased ? (
        <span lang="he" dir="rtl" className={styles.zal} aria-hidden="true">
          ז״ל
        </span>
      ) : null}
      {person.deceased ? <span className="sr-only">— of blessed memory</span> : null}
    </span>
  );
}

export default async function SurvivorRegistryPage({
  searchParams,
}: PageProps<"/curator/survivors">) {
  const params = await searchParams;
  const locale = localeFrom(params.lang);
  const copy = copyFor(locale);
  const actor = await requireAction("view_archive_workspace", "/curator/survivors");
  const input = listInputFrom(params);
  const store = await getSurvivorRegistryStore();
  const result = await store.list(input);

  const expandedPersonId = typeof params.person === "string" ? params.person : "";
  const adding = params.add === "1";
  const expandedPerson = expandedPersonId
    ? result.items.find((person) => person.id === expandedPersonId) ??
      (await store.get(expandedPersonId)) ??
      null
    : null;

  const survivorCount =
    result.facets.generations.find((facet) => facet.value === "survivor")?.count ?? 0;
  const hasFilters =
    Boolean(input.query) ||
    input.generation !== "all" ||
    input.family !== "all" ||
    input.status !== "all";
  const clearHref = registryHref(
    { ...input, query: "", generation: "all", family: "all", status: "all", page: 1 },
    locale,
  );

  return (
    <WorkspaceShell
      actor={actor}
      locale={locale}
      path="/curator/survivors"
      title={copy.title}
      description={copy.description}
    >
      <section className={styles.section} aria-labelledby="registry-title">
        <div className="content-wrap">
          <header className={styles.introduction}>
            <div>
              <p className={styles.kicker}>{copy.kicker}</p>
              <h2 id="registry-title">{copy.heading}</h2>
              <p>{copy.intro}</p>
              <p className={styles.sourceNote}>{copy.sourceNote}</p>
            </div>
            <dl className={styles.totals} aria-label={copy.title}>
              <div>
                <dt>{copy.totals.people}</dt>
                <dd>{result.facets.living + result.facets.deceased}</dd>
              </div>
              <div>
                <dt>{copy.totals.survivors}</dt>
                <dd>{survivorCount}</dd>
              </div>
              <div>
                <dt>{copy.totals.families}</dt>
                <dd>{result.facets.families.length}</dd>
              </div>
              <div>
                <dt>
                  <span lang="he" dir="rtl">
                    ז״ל
                  </span>
                </dt>
                <dd>{result.facets.deceased}</dd>
              </div>
            </dl>
          </header>

          <div className={styles.actions}>
            <form
              className={styles.filters}
              action="/curator/survivors"
              method="get"
              role="search"
              aria-label={copy.searchLabel}
            >
              <input type="hidden" name="lang" value={locale} />
              {input.family !== "all" ? (
                <input type="hidden" name="family" value={input.family} />
              ) : null}
              <div className={styles.searchField}>
                <label htmlFor="registry-query">{copy.searchLabel}</label>
                <input
                  id="registry-query"
                  name="q"
                  type="search"
                  defaultValue={input.query}
                  placeholder={copy.searchPlaceholder}
                />
              </div>
              <div className={styles.selectField}>
                <label htmlFor="registry-generation">{copy.generationLabel}</label>
                <select id="registry-generation" name="generation" defaultValue={input.generation}>
                  <option value="all">{copy.allGenerations}</option>
                  {result.facets.generations.map((facet) => (
                    <option key={facet.value} value={facet.value}>
                      {GENERATION_LABELS[facet.value][locale]} · {facet.count}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.selectField}>
                <label htmlFor="registry-status">{copy.statusLabel}</label>
                <select id="registry-status" name="status" defaultValue={input.status}>
                  <option value="all">{copy.allStatuses}</option>
                  <option value="living">{copy.living}</option>
                  <option value="deceased">{copy.deceased}</option>
                </select>
              </div>
              <button type="submit" className={styles.applyButton}>
                {copy.apply}
              </button>
              {hasFilters ? (
                <Link className={styles.clearLink} href={clearHref}>
                  {copy.clear}
                </Link>
              ) : null}
            </form>
            <Link
              className={styles.addButton}
              href={registryHref(input, locale, {}, { add: true })}
            >
              {copy.addPerson}
            </Link>
          </div>

          {input.family !== "all" ? (
            <p className={styles.familyBanner}>
              {copy.familyFilterOn(input.family)}{" "}
              <Link href={registryHref({ ...input, family: "all", page: 1 }, locale)}>
                {copy.clear}
              </Link>
            </p>
          ) : null}

          {adding ? (
            <div className={styles.editorCard}>
              <RegistryPersonEditor
                locale={locale}
                closeHref={registryHref(input, locale)}
              />
            </div>
          ) : null}

          {result.items.length === 0 ? (
            <div className={styles.empty}>
              <h3>{copy.emptyTitle}</h3>
              <p>{copy.emptyBody}</p>
              <Link className={styles.clearLink} href={clearHref}>
                {copy.clear}
              </Link>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption className="sr-only">{copy.title}</caption>
                <thead>
                  <tr>
                    <th scope="col">{copy.columns.name}</th>
                    <th scope="col">{copy.columns.generation}</th>
                    <th scope="col">{copy.columns.family}</th>
                    <th scope="col">{copy.columns.origin}</th>
                    <th scope="col">{copy.columns.camps}</th>
                    <th scope="col">{copy.columns.contact}</th>
                    <th scope="col">
                      <span className="sr-only">{copy.edit}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((person) => (
                    <Fragment key={person.id}>
                      <tr className={styles.row}>
                        <td>
                          <NameCell person={person} />
                        </td>
                        <td>
                          <span className={styles.generation} data-generation={person.generation}>
                            {GENERATION_LABELS[person.generation][locale]}
                          </span>
                        </td>
                        <td>
                          {person.familyKey && person.familyKey !== "Unlinked" ? (
                            <Link
                              className={styles.familyLink}
                              href={registryHref(
                                { ...input, family: person.familyKey, page: 1 },
                                locale,
                              )}
                            >
                              {person.familyKey}
                            </Link>
                          ) : (
                            <span className={styles.muted}>—</span>
                          )}
                        </td>
                        <td>{person.countryOfOrigin || <span className={styles.muted}>—</span>}</td>
                        <td>
                          {person.camps.length || person.fateNotes.length ? (
                            [...person.camps, ...person.fateNotes].join(" · ")
                          ) : (
                            <span className={styles.muted}>—</span>
                          )}
                        </td>
                        <td className={styles.contact}>
                          {contactSummary(person) || <span className={styles.muted}>—</span>}
                        </td>
                        <td className={styles.rowAction}>
                          <Link
                            href={registryHref(input, locale, {}, { person: person.id })}
                            aria-label={`${copy.edit}: ${person.firstName} ${person.lastName}`}
                          >
                            {copy.edit}
                          </Link>
                        </td>
                      </tr>
                      {expandedPerson?.id === person.id ? (
                        <tr className={styles.editorRow}>
                          <td colSpan={7}>
                            <RegistryPersonEditor
                              locale={locale}
                              person={expandedPerson}
                              closeHref={registryHref(input, locale)}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {expandedPerson && !result.items.some((person) => person.id === expandedPerson.id) ? (
            <div className={styles.editorCard}>
              <RegistryPersonEditor
                locale={locale}
                person={expandedPerson}
                closeHref={registryHref(input, locale)}
              />
            </div>
          ) : null}

          <footer className={styles.tableFooter}>
            <p className={styles.zalLegend}>{copy.zalLegend}</p>
            <div className={styles.pagination}>
              <span>
                {copy.matches}: {result.total} · {copy.pageOf(result.page, result.totalPages)}
              </span>
              {result.page > 1 ? (
                <Link href={registryHref({ ...input, page: result.page - 1 }, locale)}>
                  ← {copy.previous}
                </Link>
              ) : null}
              {result.page < result.totalPages ? (
                <Link href={registryHref({ ...input, page: result.page + 1 }, locale)}>
                  {copy.next} →
                </Link>
              ) : null}
            </div>
          </footer>
        </div>
      </section>
    </WorkspaceShell>
  );
}
