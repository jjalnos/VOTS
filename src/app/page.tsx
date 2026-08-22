import { ArchiveHome, type ArchiveCounts } from "@/components/archive-home";
import { PublicShell } from "@/components/public-shell";
import { getActor } from "@/lib/auth/server-session";
import { localeFrom } from "@/lib/i18n";
import { selectFeaturedRecords } from "@/lib/publication/featured-records";
import { getArchiveRepository } from "@/lib/repository";
import { getSurvivorRegistryStore } from "@/lib/survivor-registry/store";

/**
 * The homepage counters state facts, so each one is computed, not typed in.
 * The registry count is a plain total — no names or details leave the
 * private store — and if the registry is unreachable the band simply
 * omits it rather than failing the page.
 */
async function archiveCounts(records: number, photographs: number): Promise<ArchiveCounts> {
  let names: number | null = null;
  try {
    const store = await getSurvivorRegistryStore();
    const result = await store.list({
      query: "",
      generation: "all",
      family: "all",
      status: "all",
      page: 1,
      pageSize: 1,
    });
    names = result.facets.living + result.facets.deceased;
  } catch {
    names = null;
  }
  return { names, photographs, records };
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const locale = localeFrom((await searchParams).lang);
  const catalog = await getArchiveRepository().publicCatalog(locale);
  const actor = await getActor();
  const featured = selectFeaturedRecords(catalog, locale);
  const photographs = catalog.survivors.filter((survivor) => survivor.portrait).length;
  const counts = await archiveCounts(catalog.survivors.length, photographs);

  return (
    <PublicShell locale={locale} path="/">
      <ArchiveHome
        locale={locale}
        featuredRecords={featured}
        counts={counts}
      />
    </PublicShell>
  );
}
