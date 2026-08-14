import { randomUUID } from "node:crypto";
import type { Actor } from "@/lib/auth/policy";
import type { AuditEvent } from "@/lib/domain/types";

export function createAuditEvent(
  actor: Actor | null,
  input: Omit<AuditEvent, "id" | "actorUserId" | "occurredAt">,
  now = new Date().toISOString(),
): AuditEvent {
  return {
    id: randomUUID(),
    actorUserId: actor?.userId,
    occurredAt: now,
    ...input,
  };
}
