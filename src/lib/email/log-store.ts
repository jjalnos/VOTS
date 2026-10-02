import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { emailLog } from "@/db/schema";
import { noopEmailLogRecorder, type EmailLogRecorder, type EmailLogRow } from "@/lib/email/log";
import { configuredDataAdapter } from "@/lib/repository";

/** Loads within this many seconds of the last counted one are not counted again. */
export const EMAIL_OPEN_DEBOUNCE_SECONDS = 60;
/** A row stops counting loads here; the pixel keeps answering regardless. */
export const EMAIL_OPEN_COUNT_CAP = 1000;

/**
 * Postgres-backed recorder. `record` is a plain insert on its own connection
 * (never inside a caller's transaction, so a failing write cannot abort the
 * caller's work), and `markOpened` is one atomic UPDATE keyed on the token
 * hash that only ever touches rows the transport accepted. The update is
 * debounced and capped in the WHERE clause itself, so a mail client that
 * re-fetches the pixel in a loop, or anyone replaying a leaked pixel URL,
 * cannot turn one row into unbounded writes or a nonsense count.
 */
export function postgresEmailLogRecorder(): EmailLogRecorder {
  return {
    async record(row: EmailLogRow) {
      await getDatabase().insert(emailLog).values(row);
    },
    async markOpened(trackingTokenHash: string) {
      await getDatabase()
        .update(emailLog)
        .set({
          openedAt: sql`coalesce(${emailLog.openedAt}, now())`,
          lastOpenedAt: sql`now()`,
          openCount: sql`${emailLog.openCount} + 1`,
        })
        .where(
          and(
            eq(emailLog.trackingTokenHash, trackingTokenHash),
            eq(emailLog.status, "sent"),
            or(
              isNull(emailLog.lastOpenedAt),
              lt(
                emailLog.lastOpenedAt,
                sql`now() - make_interval(secs => ${EMAIL_OPEN_DEBOUNCE_SECONDS})`,
              ),
            ),
            lt(emailLog.openCount, EMAIL_OPEN_COUNT_CAP),
          ),
        );
    },
  };
}

export function defaultEmailLogRecorder(): EmailLogRecorder {
  return configuredDataAdapter() === "postgres" ? postgresEmailLogRecorder() : noopEmailLogRecorder;
}
