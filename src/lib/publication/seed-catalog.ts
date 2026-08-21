/**
 * Publishes reviewed survivor records into the public catalog.
 *
 * The PostgreSQL repository reads the public catalog but nothing writes it, so
 * a fresh deployment serves empty pages. This is the controlled write path.
 *
 * It publishes only the records named in PUBLISHABLE_SLUGS, only from sources
 * that are already approved, and it refuses outright to touch the private
 * sentinel fixtures — those exist to prove unpublished material never reaches
 * public views, and seeding one would defeat the test it stands for.
 */
import { eq } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import {
  auditEvents,
  families,
  publicReleases,
  sources,
  survivors,
  userRoles,
  users,
} from "@/db/schema";
import { seedSources, seedSurvivors, seedPublicReleases } from "@/lib/data/seed";

export const CATALOG_SEED_CONFIRMATION = "PUBLISH_REVIEWED_CATALOG";
const CONFIRMATION = CATALOG_SEED_CONFIRMATION;

export type CatalogSeedStatus = "disabled" | "published" | "already-present";

/** Only these survivor records may be published by this routine. */
export const PUBLISHABLE_SLUGS = new Set([
  "sam-cohen",
  "stephan-jalnos",
  "susanne-jalnos",
  "anna-levit",
  "anna-rado",
  "david-scharff",
  "golda-scharff",
  "george-fodor",
  "harry-weiss",
  "ilona-haendel",
  "nathan-haendel",
  "mathilde-rosenblatt",
  "oscar-ehrenberg",
  "roman-lubetzky",
  "rose-williams",
]);

/**
 * Photographs published beside a survivor, each with the credit and permission
 * it is published under. Add an entry here only for an image the archive
 * actually has the right to show.
 *
 * This map is the source of truth for portraits: syncPortraitsFromCode applies
 * it at every startup, so adding or correcting an entry deploys with the code
 * and needs no environment flag. It only updates survivors that already exist —
 * creating records stays behind the SEED_CONFIRM publication gate.
 */
export const PORTRAITS: Record<string, { url: string; credit: string; rights: string }> = {
  "sam-cohen": {
    url: "/sam-cohen-family.jpg",
    credit: "Cohen family photograph",
    rights: "Family photograph supplied for this project.",
  },
  "stephan-jalnos": {
    url: "/generation-to-generation-family.png",
    credit: "A Jalnos family photograph",
    rights: "Family photograph supplied for this project.",
  },
  "susanne-jalnos": {
    url: "/susanne-jalnos-portrait.jpg",
    credit: "Detail from an HMMSA Survivor Speakers Series announcement, 21 September 2025",
    rights: "Reproduced from material the museum published publicly. Written permission from the museum and the family is being sought.",
  },

  "david-scharff": {
    url: "/david-scharff.jpg",
    credit: "David Scharff, Holocaust Memorial Museum of San Antonio",
    rights: "Reproduced from material the museum published publicly. Written permission from the museum is being sought.",
  },
  "golda-scharff": {
    url: "/golda-scharff.jpg",
    credit: "Golda Scharff, Holocaust Memorial Museum of San Antonio",
    rights: "Reproduced from material the museum published publicly. Written permission from the museum is being sought.",
  },
  "george-fodor": {
    url: "/george-fodor-family.jpg",
    credit: "George Fodor with his parents and sister, Holocaust Memorial Museum of San Antonio",
    rights: "Reproduced from material the museum published publicly. Written permission from the museum is being sought.",
  },
  "harry-weiss": {
    url: "/harry-weiss.jpg",
    credit: "Harry Weiss, Holocaust Memorial Museum of San Antonio",
    rights: "Reproduced from material the museum published publicly. Written permission from the museum is being sought.",
  },
  "mathilde-rosenblatt": {
    url: "/mathilde-rosenblatt.jpg",
    credit: "Mathilde Schwarz Rosenblatt, Holocaust Memorial Museum of San Antonio",
    rights: "Reproduced from material the museum published publicly. Written permission from the museum is being sought.",
  },
  "oscar-ehrenberg": {
    url: "/oscar-ehrenberg.jpg",
    credit: "Oscar Ehrenberg, Holocaust Memorial Museum of San Antonio",
    rights: "Reproduced from material the museum published publicly. Written permission from the museum is being sought.",
  },
  "roman-lubetzky": {
    url: "/roman-lubetzky.jpg",
    credit: "Roman Lubetzky with his son Daniel, Holocaust Memorial Museum of San Antonio",
    rights: "Reproduced from material the museum published publicly. Written permission from the museum is being sought.",
  },
};

/** Anything matching these never goes to a public database. */
export function isSentinelRecord(value: string): boolean {
  return /private|sentinel|never-public|unapproved/i.test(value);
}

export async function ensurePublishedCatalogFromEnvironment(): Promise<CatalogSeedStatus> {
  if (process.env.SEED_CONFIRM !== CONFIRMATION) return "disabled";
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required to publish the catalog.");

  const db = getDatabase();

  // Every published record is attributed to a real curator identity.
  const [curator] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(eq(userRoles.role, "curator"))
    .limit(1);
  if (!curator) {
    throw new Error("No curator identity exists yet; run the curator bootstrap first.");
  }

  const familyName = "HMMSA community records";
  const existingFamilies = await db.select({ id: families.id, name: families.name }).from(families);
  let familyId = existingFamilies.find((row) => row.name === familyName)?.id;
  if (!familyId) {
    const [created] = await db
      .insert(families)
      .values({ name: familyName, invitationOnly: true })
      .returning({ id: families.id });
    familyId = created.id;
    console.log(`created family: ${familyName}`);
  }

  // --- sources -----------------------------------------------------------
  const sourceIdMap = new Map<string, string>();
  const existingSources = await db.select({ id: sources.id, title: sources.title }).from(sources);
  for (const fixture of seedSources) {
    if (fixture.approvalStatus !== "approved" || isSentinelRecord(fixture.id) || isSentinelRecord(fixture.title)) {
      console.log(`skipped source (not approved or sentinel): ${fixture.title}`);
      continue;
    }
    const already = existingSources.find((row) => row.title === fixture.title);
    if (already) {
      sourceIdMap.set(fixture.id, already.id);
      continue;
    }
    const [created] = await db
      .insert(sources)
      .values({
        title: fixture.title,
        publisher: fixture.publisher,
        url: fixture.url,
        citation: fixture.citation,
        approvalStatus: "approved",
        approvedBy: curator.id,
        approvedAt: new Date(),
      })
      .returning({ id: sources.id });
    sourceIdMap.set(fixture.id, created.id);
    console.log(`published source: ${fixture.title}`);
  }

  // --- survivors ---------------------------------------------------------
  const survivorIdMap = new Map<string, string>();
  const existingSurvivors = await db
    .select({ id: survivors.id, slug: survivors.slug })
    .from(survivors);
  for (const fixture of seedSurvivors) {
    if (!PUBLISHABLE_SLUGS.has(fixture.slug) || isSentinelRecord(fixture.slug)) {
      console.log(`skipped survivor (not on the publish list): ${fixture.slug}`);
      continue;
    }
    if (fixture.reviewStatus !== "approved") {
      console.log(`skipped survivor (not approved): ${fixture.slug}`);
      continue;
    }
    const already = existingSurvivors.find((row) => row.slug === fixture.slug);
    if (already) {
      survivorIdMap.set(fixture.id, already.id);
      console.log(`survivor already present: ${fixture.slug}`);
      continue;
    }
    const [created] = await db
      .insert(survivors)
      .values({
        slug: fixture.slug,
        familyId,
        displayName: fixture.displayName,
        summary: fixture.summary,
        originalLanguage: fixture.originalLanguage,
        reviewStatus: "approved",
        isDemonstration: fixture.isDemonstration,
        createdBy: curator.id,
      })
      .returning({ id: survivors.id });
    survivorIdMap.set(fixture.id, created.id);
    console.log(`published survivor: ${fixture.slug}`);
  }

  // --- portraits ---------------------------------------------------------
  await syncPortraitsFromCode();

  // --- releases ----------------------------------------------------------
  const existingReleases = await db
    .select({
      id: publicReleases.id,
      entityId: publicReleases.entityId,
      locale: publicReleases.locale,
    })
    .from(publicReleases);
  for (const fixture of seedPublicReleases) {
    if (fixture.entityType !== "survivor") continue;
    const entityId = survivorIdMap.get(fixture.entityId);
    if (!entityId) continue;
    if (fixture.status !== "published") continue;

    const mappedSources = fixture.sourceIds
      .map((id) => sourceIdMap.get(id))
      .filter((id): id is string => Boolean(id));
    if (!mappedSources.length) {
      console.log(`skipped release without an approved source: ${fixture.id}`);
      continue;
    }
    const already = existingReleases.find(
      (row) => row.entityId === entityId && row.locale === fixture.locale,
    );
    if (already) continue;

    await db.insert(publicReleases).values({
      entityType: "survivor",
      entityId,
      locale: fixture.locale,
      status: "published",
      sourceIds: mappedSources,
      rightsSnapshot: fixture.rightsSnapshot,
      publishedBy: curator.id,
      publishedAt: new Date(),
    });
    console.log(`published release: ${fixture.entityId} (${fixture.locale})`);
  }

  await db.insert(auditEvents).values({
    actorUserId: curator.id,
    action: "publication.catalog_seeded",
    entityType: "public_release",
    entityId: curator.id,
    metadata: {
      method: "seed-public-catalog script",
      survivors: [...survivorIdMap.keys()],
      sources: [...sourceIdMap.keys()],
    },
    occurredAt: new Date(),
  });

  return survivorIdMap.size ? "published" : "already-present";
}


/**
 * Brings survivors' portraits in line with the PORTRAITS map. Update-only: a
 * survivor that does not exist is skipped, never created, and a slug outside
 * PUBLISHABLE_SLUGS is never touched. Runs at every startup so a photograph
 * added to the code appears on the next deploy.
 */
/**
 * Clears the demonstration flag on published survivors.
 *
 * The profile page renders a "demonstration record" notice from this column,
 * and the seeder only sets it when a record is first created — so survivors
 * published before these became real, sourced people kept the flag and were
 * publicly labelled demonstrations. Update-only, like the portrait sync.
 */
export async function syncDemonstrationFlagFromCode(): Promise<number> {
  const db = getDatabase();
  let cleared = 0;
  for (const slug of PUBLISHABLE_SLUGS) {
    if (isSentinelRecord(slug)) continue;
    const [row] = await db
      .select({ id: survivors.id, isDemonstration: survivors.isDemonstration })
      .from(survivors)
      .where(eq(survivors.slug, slug))
      .limit(1);
    if (!row || row.isDemonstration === false) continue;
    await db
      .update(survivors)
      .set({ isDemonstration: false })
      .where(eq(survivors.id, row.id));
    cleared += 1;
    console.log(`cleared demonstration flag: ${slug}`);
  }
  return cleared;
}

export async function syncPortraitsFromCode(): Promise<number> {
  const db = getDatabase();
  let applied = 0;
  for (const [slug, portrait] of Object.entries(PORTRAITS)) {
    if (!PUBLISHABLE_SLUGS.has(slug) || isSentinelRecord(slug)) continue;
    const [row] = await db
      .select({
        id: survivors.id,
        portraitUrl: survivors.portraitUrl,
        portraitCredit: survivors.portraitCredit,
        portraitRights: survivors.portraitRights,
      })
      .from(survivors)
      .where(eq(survivors.slug, slug))
      .limit(1);
    if (!row) continue;
    if (
      row.portraitUrl === portrait.url &&
      row.portraitCredit === portrait.credit &&
      row.portraitRights === portrait.rights
    ) {
      continue;
    }
    await db
      .update(survivors)
      .set({
        portraitUrl: portrait.url,
        portraitCredit: portrait.credit,
        portraitRights: portrait.rights,
      })
      .where(eq(survivors.id, row.id));
    applied += 1;
    console.log(`portrait synced: ${slug}`);
  }
  return applied;
}
