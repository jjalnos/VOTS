import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { emailLog } from "@/db/schema";

const ROOT = process.cwd();
const MIGRATION = path.join(ROOT, "drizzle", "0012_email_log.sql");
const JOURNAL = path.join(ROOT, "drizzle", "meta", "_journal.json");

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

const sql = readFileSync(MIGRATION, "utf8");
const statements = sql
  .split("--> statement-breakpoint")
  .map((statement) =>
    statement
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n")
      .trim(),
  )
  .filter((statement) => statement.length > 0);
const journal = JSON.parse(readFileSync(JOURNAL, "utf8")) as { entries: JournalEntry[] };
const config = getTableConfig(emailLog);

function names(pattern: RegExp): string[] {
  return [...sql.matchAll(pattern)].map((match) => match[1]).sort();
}

describe("migration 0012_email_log", () => {
  it("creates the table first and only ever adds", () => {
    expect(statements.length).toBeGreaterThanOrEqual(5);
    expect(statements[0].startsWith('CREATE TABLE IF NOT EXISTS "email_log" (')).toBe(true);
    for (const statement of statements) {
      // "ON DELETE set null" / "ON UPDATE no action" are FK clauses, not data statements.
      expect(statement).not.toMatch(/\b(DROP|TRUNCATE|(?<!ON )DELETE|(?<!ON )UPDATE|RENAME|ALTER COLUMN|DISABLE)\b/i);
      expect(
        /^CREATE TABLE IF NOT EXISTS /.test(statement) ||
          /^CREATE (UNIQUE )?INDEX IF NOT EXISTS /.test(statement) ||
          /^DO \$\$ BEGIN[\s\S]*END \$\$;$/.test(statement),
      ).toBe(true);
    }
  });

  it("is idempotent: every ALTER lives in a DO block that swallows duplicate_object", () => {
    const alters = statements.filter((statement) => statement.includes("ALTER TABLE"));
    expect(alters).toHaveLength(3);
    for (const statement of alters) {
      expect(statement.startsWith("DO $$ BEGIN")).toBe(true);
      expect(statement).toContain("WHEN duplicate_object THEN null");
      expect(statement).toMatch(/ADD CONSTRAINT "email_log_\w+_fk" FOREIGN KEY/);
      expect(statement).toContain("ON DELETE set null");
    }
    const indexes = statements.filter((statement) => statement.includes("INDEX"));
    expect(indexes).toHaveLength(6);
    for (const statement of indexes) expect(statement).toContain("IF NOT EXISTS");
  });

  it("matches the drizzle schema column for column", () => {
    const create = statements[0];
    const sqlColumns = [...create.matchAll(/^\s+"([a-z_]+)" /gm)].map((match) => match[1]).sort();
    expect(sqlColumns).toEqual(config.columns.map((column) => column.name).sort());
    expect(config.name).toBe("email_log");
    expect(sqlColumns).toContain("tracking_token_hash");
    expect(sqlColumns).not.toContain("tracking_token");
    expect(sqlColumns).not.toContain("ip_address");
    expect(sqlColumns).not.toContain("user_agent");
  });

  it("matches the drizzle schema's indexes, checks and foreign keys", () => {
    const sqlIndexes = names(/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS "(\w+)"/g);
    expect(sqlIndexes).toEqual(config.indexes.map((index) => index.config.name as string).sort());

    const unique = config.indexes.filter((index) => index.config.unique);
    expect(unique.map((index) => index.config.name)).toEqual(["email_log_tracking_token_hash_idx"]);
    expect(unique[0].config.where).toBeDefined();
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS "email_log_tracking_token_hash_idx" ON "email_log" \("tracking_token_hash"\) WHERE "tracking_token_hash" IS NOT NULL;/,
    );

    expect(names(/CONSTRAINT "(\w+)" CHECK/g)).toEqual(config.checks.map((check) => check.name).sort());
    expect(sql).toContain(`CHECK ("status" IN ('sent', 'failed'))`);
    expect(sql).toContain(`CHECK ("open_count" >= 0)`);

    const sqlForeignKeys = names(/ADD CONSTRAINT "(\w+)" FOREIGN KEY/g);
    expect(sqlForeignKeys).toEqual(config.foreignKeys.map((key) => key.getName()).sort());
    expect(sqlForeignKeys).toEqual([
      "email_log_actor_user_id_users_id_fk",
      "email_log_communication_id_communications_id_fk",
      "email_log_recipient_user_id_users_id_fk",
    ]);
    for (const key of config.foreignKeys) expect(key.onDelete).toBe("set null");
  });

  it("indexes created_at so a future retention job can prune by age", () => {
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "email_log_created_idx" ON "email_log" ("created_at");');
    expect(sql).toContain('"email_log_status_created_idx" ON "email_log" ("status", "created_at")');
    expect(sql).toContain('"email_log_type_created_idx" ON "email_log" ("email_type", "created_at")');
    expect(sql).toContain('"email_log_communication_idx" ON "email_log" ("communication_id")');
  });
});

describe("drizzle journal", () => {
  it("lists 0012_email_log as the newest, contiguous entry in the repo style", () => {
    const entries = journal.entries;
    const last = entries[entries.length - 1];
    const previous = entries[entries.length - 2];
    expect(last).toEqual({
      idx: 12,
      version: "7",
      when: expect.any(Number),
      tag: "0012_email_log",
      breakpoints: true,
    });
    expect(previous.tag).toBe("0011_communications");
    expect(last.when).toBeGreaterThan(previous.when);
    expect(last.version).toBe(previous.version);
    entries.forEach((entry, index) => expect(entry.idx).toBe(index));
    expect(entries.filter((entry) => entry.tag === "0012_email_log")).toHaveLength(1);
  });

  it("has a SQL file on disk for every journal tag", () => {
    for (const entry of journal.entries) {
      expect(existsSync(path.join(ROOT, "drizzle", `${entry.tag}.sql`)), entry.tag).toBe(true);
    }
  });
});
