import type { Actor } from "@/lib/auth/policy";
import { can } from "@/lib/auth/policy";
import { getActorFromRequest } from "@/lib/auth/server-session";

export type SusanneOwnerAuthorization =
  | { ok: true; actor: Actor }
  | { ok: false; status: 401 | 403 | 503; error: string };

function normalizedEmail(value: string | null | undefined): string | undefined {
  const email = value?.trim().toLocaleLowerCase("en");
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(email)) return undefined;
  return email;
}

export function evaluateSusanneOwnerAccess(
  actor: Actor | null,
  configuredOwnerEmail: string | null | undefined,
): SusanneOwnerAuthorization {
  if (!actor) {
    return { ok: false, status: 401, error: "Authentication required." };
  }

  const ownerEmail = normalizedEmail(configuredOwnerEmail);
  if (!ownerEmail) {
    return {
      ok: false,
      status: 503,
      error: "The private Susanne experience is not configured.",
    };
  }

  if (!can(actor, "manage_access") || normalizedEmail(actor.email) !== ownerEmail) {
    return {
      ok: false,
      status: 403,
      error: "This private family experience is restricted to its configured owner.",
    };
  }

  return { ok: true, actor };
}

/**
 * Resolves the current actor through the configured auth provider, so a stale
 * cookie cannot preserve access after a database role or account is revoked.
 */
export async function authorizeSusanneOwner(
  request: Request,
): Promise<SusanneOwnerAuthorization> {
  const actor = await getActorFromRequest(request);
  return evaluateSusanneOwnerAccess(actor, process.env.SUSANNE_OWNER_EMAIL);
}

export function susanneAiEnabled(): boolean {
  return process.env.SUSANNE_AI_ENABLED === "true";
}
