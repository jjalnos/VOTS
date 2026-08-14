import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Action, Actor } from "@/lib/auth/policy";
import { can } from "@/lib/auth/policy";
import { resolveConfiguredSessionActor } from "@/lib/auth/provider";
import { verifySession } from "@/lib/auth/session-token";

export const SESSION_COOKIE = "hmmsa_archive_session";

export function sessionSecret(): string | undefined {
  if (process.env.AUTH_SESSION_SECRET) {
    if (process.env.NODE_ENV === "production" && process.env.AUTH_SESSION_SECRET.length < 32) {
      return undefined;
    }
    return process.env.AUTH_SESSION_SECRET;
  }
  if (process.env.NODE_ENV !== "production") return "hmmsa-development-session-secret-change-me";
  return undefined;
}

export async function getActor(): Promise<Actor | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const payload = verifySession(token, sessionSecret());
  if (!payload) return null;
  return resolveConfiguredSessionActor(payload);
}

export async function requireAction(
  action: Action,
  returnTo: string,
  resourceFamilyId?: string,
): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  if (!can(actor, action, resourceFamilyId)) redirect("/unauthorized");
  return actor;
}

export async function requireFamilyAction(
  action: "contribute_upload" | "view_family_workspace",
  returnTo: string,
): Promise<Actor & { familyId: string }> {
  const actor = await getActor();
  if (!actor) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  if (!actor.familyId || !can(actor, action, actor.familyId)) redirect("/unauthorized");
  return actor as Actor & { familyId: string };
}
