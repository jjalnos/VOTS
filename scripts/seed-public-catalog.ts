/**
 * Runs the controlled public-catalog publication from a shell.
 *
 *   SEED_CONFIRM=PUBLISH_REVIEWED_CATALOG DATABASE_URL=... npm run seed:catalog
 *
 * The same routine also runs at startup when SEED_CONFIRM is set, which is how
 * it is invoked on Cloudways where there is no convenient shell.
 */
import { closeDatabase } from "@/db/client";
import {
  CATALOG_SEED_CONFIRMATION,
  ensurePublishedCatalogFromEnvironment,
} from "@/lib/publication/seed-catalog";

ensurePublishedCatalogFromEnvironment()
  .then((status) => {
    if (status === "disabled") {
      console.error(`Set SEED_CONFIRM=${CATALOG_SEED_CONFIRMATION} to publish the reviewed catalog.`);
      process.exitCode = 1;
      return;
    }
    console.log(`catalog ${status}`);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
