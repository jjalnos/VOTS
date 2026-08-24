import { redirect } from "next/navigation";
import { localeFrom, withLocale } from "@/lib/i18n";

/**
 * The review queue is now the intake register itself: an upload is opened and
 * decided in the one place it already lives, at /curator/archive/[id].
 *
 * This file stays as a redirect rather than being deleted. Cloudways releases
 * overlay the previous checkout, so a removed route keeps serving the old page
 * on the server until something overwrites it.
 */
export default async function CuratorReviewRedirect({
  searchParams,
}: PageProps<"/curator/review">) {
  const locale = localeFrom((await searchParams).lang);
  redirect(withLocale("/curator/archive?status=pending", locale));
}
