import { redirect } from "next/navigation";
import { localeFrom } from "@/lib/i18n";

/**
 * The curator upload demo grew into the real archive upload page at /upload,
 * which faces administrators and invited family contributors. This route
 * stays as a redirect for old links — and because deploys on this host
 * overlay the previous release, a deleted file would keep serving otherwise.
 */
export default async function LegacyCuratorUploadPage({
  searchParams,
}: PageProps<"/curator/upload">) {
  const locale = localeFrom((await searchParams).lang);
  redirect(locale === "es" ? "/upload?lang=es" : "/upload");
}
