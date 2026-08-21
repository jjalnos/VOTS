import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { LocalizedText } from "@/lib/domain/types";

export const roleName = pgEnum("role_name", ["admin", "curator", "family", "viewer"]);
export const archiveLanguage = pgEnum("archive_language", ["en", "es", "other"]);
export const reviewStatus = pgEnum("review_status", [
  "pending",
  "in_review",
  "approved",
  "rejected",
]);
export const visibility = pgEnum("visibility", ["private", "family", "public"]);
export const publicationStatus = pgEnum("publication_status", [
  "draft",
  "published",
  "withdrawn",
]);
export const suggestionStatus = pgEnum("suggestion_status", [
  "suggested",
  "approved",
  "rejected",
]);
export const decisionType = pgEnum("decision_type", [
  "approve",
  "reject",
  "request_changes",
]);

const auditColumns = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    displayName: varchar("display_name", { length: 180 }).notNull(),
    passwordHash: text("password_hash"),
    sessionVersion: integer("session_version").default(1).notNull(),
    mfaRequired: boolean("mfa_required").default(false).notNull(),
    mfaProviderReference: text("mfa_provider_reference"),
    active: boolean("active").default(true).notNull(),
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...auditColumns,
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleName("role").notNull(),
    grantedBy: uuid("granted_by").references(() => users.id, { onDelete: "set null" }),
    grantedAt: timestamp("granted_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.role] })],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    sessionVersionAtIssue: integer("session_version_at_issue").notNull(),
    locale: varchar("locale", { length: 2 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    usedAt: timestamp("used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("password_reset_tokens_hash_unique").on(table.tokenHash),
    index("password_reset_tokens_user_expiry_idx").on(table.userId, table.expiresAt),
    index("password_reset_tokens_expiry_idx").on(table.expiresAt),
  ],
);

export const passwordResetRateLimits = pgTable(
  "password_reset_rate_limits",
  {
    scopeKey: varchar("scope_key", { length: 220 }).primaryKey(),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
    requestCount: integer("request_count").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    check("password_reset_rate_limits_count_positive", sql`${table.requestCount} > 0`),
  ],
);

export const families = pgTable(
  "families",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 240 }).notNull(),
    invitationOnly: boolean("invitation_only").default(true).notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...auditColumns,
  },
  (table) => [index("families_name_idx").on(table.name)],
);

export const familyMemberships = pgTable(
  "family_memberships",
  {
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    invitedAt: timestamp("invited_at", { withTimezone: true }).defaultNow().notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.familyId, table.userId] }),
    index("family_memberships_user_idx").on(table.userId),
  ],
);

export const survivors = pgTable(
  "survivors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 180 }).notNull(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "restrict" }),
    displayName: jsonb("display_name").$type<LocalizedText>().notNull(),
    summary: jsonb("summary").$type<LocalizedText>().notNull(),
    originalLanguage: archiveLanguage("original_language").notNull(),
    reviewStatus: reviewStatus("review_status").default("pending").notNull(),
    isDemonstration: boolean("is_demonstration").default(false).notNull(),
    portraitUrl: text("portrait_url"),
    portraitCredit: text("portrait_credit"),
    portraitRights: text("portrait_rights"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex("survivors_slug_unique").on(table.slug),
    index("survivors_family_idx").on(table.familyId),
    index("survivors_review_idx").on(table.reviewStatus),
  ],
);

export const relationships = pgTable(
  "relationships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    survivorId: uuid("survivor_id")
      .notNull()
      .references(() => survivors.id, { onDelete: "cascade" }),
    relatedUserId: uuid("related_user_id").references(() => users.id, { onDelete: "set null" }),
    relationshipLabel: jsonb("relationship_label").$type<LocalizedText>().notNull(),
    reviewStatus: reviewStatus("review_status").default("pending").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("relationships_family_idx").on(table.familyId),
    index("relationships_survivor_idx").on(table.survivorId),
  ],
);

export const archiveItems = pgTable(
  "archive_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    survivorId: uuid("survivor_id").references(() => survivors.id, { onDelete: "set null" }),
    familyId: uuid("family_id").references(() => families.id, { onDelete: "restrict" }),
    title: varchar("title", { length: 180 }).notNull(),
    itemType: varchar("item_type", { length: 32 }).notNull(),
    sourceContributor: varchar("source_contributor", { length: 240 }).notNull(),
    originalLanguage: archiveLanguage("original_language").notNull(),
    consentRights: varchar("consent_rights", { length: 40 }).notNull(),
    rightsStatement: text("rights_statement").notNull(),
    visibility: visibility("visibility").default("private").notNull(),
    reviewStatus: reviewStatus("review_status").default("pending").notNull(),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...auditColumns,
  },
  (table) => [
    index("archive_items_survivor_idx").on(table.survivorId),
    index("archive_items_family_idx").on(table.familyId),
    index("archive_items_visibility_review_idx").on(table.visibility, table.reviewStatus),
  ],
);

export const fileVersions = pgTable(
  "file_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    archiveItemId: uuid("archive_item_id")
      .notNull()
      .references(() => archiveItems.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    storageProvider: varchar("storage_provider", { length: 40 }).notNull(),
    storageKey: text("storage_key").notNull(),
    originalFilename: text("original_filename").notNull(),
    mediaType: varchar("media_type", { length: 180 }).notNull(),
    byteSize: integer("byte_size").notNull(),
    checksumSha256: varchar("checksum_sha256", { length: 64 }).notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("file_versions_item_version_unique").on(table.archiveItemId, table.versionNumber),
  ],
);

export const extractedFacts = pgTable(
  "extracted_facts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    archiveItemId: uuid("archive_item_id")
      .notNull()
      .references(() => archiveItems.id, { onDelete: "cascade" }),
    field: varchar("field", { length: 120 }).notNull(),
    value: jsonb("value").$type<LocalizedText>().notNull(),
    confidence: real("confidence"),
    sourceLocator: text("source_locator").notNull(),
    status: suggestionStatus("status").default("suggested").notNull(),
    generatedBy: varchar("generated_by", { length: 32 }).notNull(),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("extracted_facts_item_status_idx").on(table.archiveItemId, table.status)],
);

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    publisher: text("publisher").notNull(),
    url: text("url"),
    citation: jsonb("citation").$type<LocalizedText>().notNull(),
    approvalStatus: reviewStatus("approval_status").default("pending").notNull(),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("sources_approval_idx").on(table.approvalStatus)],
);

export const stories = pgTable(
  "stories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 180 }).notNull(),
    survivorId: uuid("survivor_id").references(() => survivors.id, { onDelete: "set null" }),
    familyId: uuid("family_id").references(() => families.id, { onDelete: "set null" }),
    title: jsonb("title").$type<LocalizedText>().notNull(),
    dek: jsonb("dek").$type<LocalizedText>().notNull(),
    body: jsonb("body").$type<LocalizedText>().notNull(),
    sourceIds: jsonb("source_ids").$type<string[]>().notNull(),
    reviewStatus: reviewStatus("review_status").default("pending").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex("stories_slug_unique").on(table.slug),
    index("stories_review_idx").on(table.reviewStatus),
  ],
);

export const timelineEvents = pgTable(
  "timeline_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    survivorId: uuid("survivor_id").references(() => survivors.id, { onDelete: "set null" }),
    familyId: uuid("family_id").references(() => families.id, { onDelete: "set null" }),
    dateLabel: jsonb("date_label").$type<LocalizedText>().notNull(),
    sortDate: timestamp("sort_date", { withTimezone: true }),
    title: jsonb("title").$type<LocalizedText>().notNull(),
    description: jsonb("description").$type<LocalizedText>().notNull(),
    sourceIds: jsonb("source_ids").$type<string[]>().notNull(),
    reviewStatus: reviewStatus("review_status").default("pending").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    ...auditColumns,
  },
  (table) => [index("timeline_events_review_sort_idx").on(table.reviewStatus, table.sortDate)],
);

export const reviewDecisions = pgTable(
  "review_decisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entityType: varchar("entity_type", { length: 40 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    decision: decisionType("decision").notNull(),
    rationale: text("rationale").notNull(),
    decidedBy: uuid("decided_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("review_decisions_entity_idx").on(table.entityType, table.entityId)],
);

export const publicReleases = pgTable(
  "public_releases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    entityType: varchar("entity_type", { length: 40 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    locale: archiveLanguage("locale").notNull(),
    status: publicationStatus("status").default("draft").notNull(),
    sourceIds: jsonb("source_ids").$type<string[]>().notNull(),
    rightsSnapshot: text("rights_snapshot").notNull(),
    publishedBy: uuid("published_by").references(() => users.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("public_releases_entity_locale_unique").on(
      table.entityType,
      table.entityId,
      table.locale,
    ),
    index("public_releases_status_idx").on(table.status, table.locale),
  ],
);

export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    locale: archiveLanguage("locale").notNull(),
    visitorTokenHash: varchar("visitor_token_hash", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("chat_sessions_last_active_idx").on(table.lastActiveAt)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 120 }).notNull(),
    entityType: varchar("entity_type", { length: 80 }).notNull(),
    entityId: uuid("entity_id"),
    familyId: uuid("family_id").references(() => families.id, { onDelete: "set null" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_events_actor_idx").on(table.actorUserId),
    index("audit_events_entity_idx").on(table.entityType, table.entityId),
    index("audit_events_occurred_idx").on(table.occurredAt),
  ],
);

export const backgroundJobs = pgTable(
  "background_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: varchar("type", { length: 60 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: varchar("status", { length: 24 }).default("queued").notNull(),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    attempts: integer("attempts").default(0).notNull(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [index("background_jobs_status_created_idx").on(table.status, table.createdAt)],
);
