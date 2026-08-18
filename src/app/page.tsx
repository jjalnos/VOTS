import { ArchiveHome } from "@/components/archive-home";
import { PublicShell } from "@/components/public-shell";
import { getActor } from "@/lib/auth/server-session";
import { localeFrom } from "@/lib/i18n";
import { selectFeaturedRecords } from "@/lib/publication/featured-records";
import { getArchiveRepository } from "@/lib/repository";

export default async function Home({ searchParams }: PageProps<"/">) {
  const locale = localeFrom((await searchParams).lang);
  const catalog = await getArchiveRepository().publicCatalog(locale);
  const actor = await getActor();

  return (
    <PublicShell locale={locale} path="/">
      <ArchiveHome
        locale={locale}
        featuredRecords={selectFeaturedRecords(catalog, locale)}
        signedIn={Boolean(actor)}
      />
    </PublicShell>
  );
}
