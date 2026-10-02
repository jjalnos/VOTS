import { getDatabase } from "@/db/client";
import { auditEvents } from "@/db/schema";
import { createAuditEvent } from "@/lib/audit/events";
import type { Actor } from "@/lib/auth/policy";
import type { AuditEvent } from "@/lib/domain/types";
import type { RegistryExportFormat } from "@/lib/survivor-registry/export";
import type { SurvivorRegistryStore } from "@/lib/survivor-registry/store";
import type { RegistryListInput } from "@/lib/survivor-registry/types";

export const REGISTRY_EXPORT_AUDIT_ACTION = "survivor_registry.exported";
export const REGISTRY_EXPORT_AUDIT_ENTITY = "survivor_registry";

/**
 * What is recorded about a download. There is deliberately no field for the
 * search text: a query is usually a person's name, so the audit trail keeps
 * only whether one was used.
 */
export interface RegistryExportAuditDetails {
  format: RegistryExportFormat;
  rowCount: number;
  /** True when the contact columns were left out (a read-only account). */
  redacted: boolean;
  generation: RegistryListInput["generation"];
  family: string;
  status: RegistryListInput["status"];
  hasQuery: boolean;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEMORY_LOG_LIMIT = 200;

const auditState = globalThis as typeof globalThis & {
  votsRegistryExportAuditLog?: AuditEvent[];
};

function buildEvent(actor: Actor, details: RegistryExportAuditDetails): AuditEvent {
  return createAuditEvent(actor, {
    action: REGISTRY_EXPORT_AUDIT_ACTION,
    entityType: REGISTRY_EXPORT_AUDIT_ENTITY,
    metadata: {
      format: details.format,
      rowCount: details.rowCount,
      redacted: details.redacted,
      generation: details.generation,
      family: details.family,
      status: details.status,
      hasQuery: details.hasQuery,
    },
  });
}

/**
 * Records one registry download in the audit trail. With the PostgreSQL
 * registry the event is a row in audit_events, like every other audited
 * action. The in-memory development registry has no database behind it, so
 * its events are kept in process memory instead.
 *
 * This throws when the event cannot be written. The caller must not hand over
 * the file in that case: a download that left no trace is the one thing the
 * audit trail exists to prevent.
 */
export async function recordRegistryExport(
  actor: Actor,
  storeMode: SurvivorRegistryStore["mode"],
  details: RegistryExportAuditDetails,
): Promise<AuditEvent> {
  const event = buildEvent(actor, details);

  if (storeMode === "memory-dev") {
    const log = (auditState.votsRegistryExportAuditLog ??= []);
    log.push(event);
    if (log.length > MEMORY_LOG_LIMIT) log.splice(0, log.length - MEMORY_LOG_LIMIT);
    return event;
  }

  // audit_events.actor_user_id is a uuid that references users. Development
  // sign-ins use readable ids ("user-curator-demo"), which that column cannot
  // hold, so those are carried in the metadata instead.
  const actorIsDatabaseUser = UUID_PATTERN.test(actor.userId);
  await getDatabase()
    .insert(auditEvents)
    .values({
      id: event.id,
      actorUserId: actorIsDatabaseUser ? actor.userId : null,
      action: event.action,
      entityType: event.entityType,
      metadata: actorIsDatabaseUser
        ? event.metadata
        : { ...event.metadata, actorReference: actor.userId },
      occurredAt: new Date(event.occurredAt),
    });
  return event;
}

/** The development registry's in-memory audit trail, oldest first. */
export function memoryRegistryExportAuditLog(): readonly AuditEvent[] {
  return auditState.votsRegistryExportAuditLog ?? [];
}

export function clearMemoryRegistryExportAuditLogForTests(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("The registry export audit log cannot be cleared in production.");
  }
  delete auditState.votsRegistryExportAuditLog;
}
