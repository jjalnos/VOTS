import { redirect } from "next/navigation";
import { localeFrom } from "@/lib/i18n";

/**
 * The family contribution workspace merged into the archive upload page at
 * /upload, which locks a family contributor to their invited group. This
 * route stays as a redirect for old links and sign-in destinations — and
 * because deploys on this host overlay the previous release, a deleted file
 * would keep serving otherwise.
 */
export default async function LegacyFamilyPage({ searchParams }: PageProps<"/family">) {
  const locale = localeFrom((await searchParams).lang);
  redirect(locale === "es" ? "/upload?lang=es" : "/upload");
}
