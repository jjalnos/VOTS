import type { Actor } from "@/lib/auth/policy";
import {
  authenticateDatabaseUser,
  resolveDatabaseSessionActor,
  type AuthenticationResult,
} from "@/lib/auth/database-auth";
import {
  authenticateDevelopmentUser,
  developmentAuthEnabled,
} from "@/lib/auth/dev-auth";
import type { SessionPayload } from "@/lib/auth/session-token";
import { staffMfaRequired } from "@/lib/auth/mfa";

export type AuthProvider = "development" | "database" | "unconfigured";

export function resolveAuthProvider(input: {
  configured?: string;
  developmentEnabled: boolean;
  nodeEnvironment?: string;
}): AuthProvider {
  if (input.configured === "database") return "database";
  if (
    (input.configured === "development" || !input.configured) &&
    input.developmentEnabled &&
    input.nodeEnvironment !== "production"
  ) {
    return "development";
  }
  return "unconfigured";
}

export function configuredAuthProvider(): AuthProvider {
  return resolveAuthProvider({
    configured: process.env.AUTH_PROVIDER,
    developmentEnabled: developmentAuthEnabled(),
    nodeEnvironment: process.env.NODE_ENV,
  });
}

export async function authenticateConfiguredUser(input: {
  email: string;
  password: string;
  mfaCode?: string;
}): Promise<AuthenticationResult> {
  const provider = configuredAuthProvider();
  if (provider === "database") return authenticateDatabaseUser(input);
  if (provider === "development") {
    const actor = authenticateDevelopmentUser(input.email, input.password, input.mfaCode);
    return actor ? { status: "authenticated", actor } : { status: "invalid" };
  }
  return { status: "unavailable" };
}

export async function resolveConfiguredSessionActor(payload: SessionPayload): Promise<Actor | null> {
  const provider = configuredAuthProvider();
  if (provider === "database") {
    return resolveDatabaseSessionActor({
      userId: payload.userId,
      mfaVerified: payload.mfaVerified,
    });
  }
  if (provider === "development") {
    const isStaff = payload.roles.some((role) => role === "admin" || role === "curator");
    return {
      userId: payload.userId,
      email: payload.email,
      displayName: payload.displayName,
      roles: payload.roles,
      familyId: payload.familyId,
      mfaVerified: isStaff && !staffMfaRequired() ? true : payload.mfaVerified,
    };
  }
  return null;
}
