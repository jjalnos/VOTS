import { notFound } from "next/navigation";

/*
 * The demonstration workspace is gone. The route file remains because
 * Cloudways overlays each release onto the previous checkout: deleting this
 * file would leave the old demonstration page serving on the server. Returning
 * a 404 removes the route while guaranteeing the overlay overwrites it.
 */
export const dynamic = "force-dynamic";

export default function RemovedDemonstrationRoute(): never {
  notFound();
}
