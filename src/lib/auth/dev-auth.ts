import { scryptSync, timingSafeEqual } from "node:crypto";
import type { Actor } from "@/lib/auth/policy";
import { seedUsers } from "@/lib/data/seed";
import { staffMfaRequired } from "@/lib/auth/mfa";

const demoPasswords: Record<string, string> = {
  "admin@archive.local": "admin-demo",
  "curator@archive.local": "curator-demo",
  "family@archive.local": "family-demo",
  "demo@voicesoftheshoah.org": "shoah-archive-demo",
};

function constantTimePasswordMatch(candidate: string, expected: string, email: string): boolean {
  const salt = `hmmsa-development-only:${email}`;
  const candidateHash = scryptSync(candidate, salt, 32);
  const expectedHash = scryptSync(expected, salt, 32);
  return timingSafeEqual(candidateHash, expectedHash);
}

export function developmentAuthEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_ENABLED === "true";
}

export function authenticateDevelopmentUser(
  emailInput: string,
  password: string,
  mfaCode?: string,
): Actor | null {
  if (!developmentAuthEnabled()) return null;
  const email = emailInput.trim().toLocaleLowerCase();
  const user = seedUsers.find((candidate) => candidate.email === email && candidate.active);
  const expectedPassword = demoPasswords[email];
  if (!user || !expectedPassword || !constantTimePasswordMatch(password, expectedPassword, email)) {
    return null;
  }
  const enforceStaffMfa = user.mfaRequired && staffMfaRequired();
  const mfaVerified = enforceStaffMfa ? mfaCode === "000000" : true;
  if (enforceStaffMfa && !mfaVerified) return null;

  return {
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    roles: user.roles,
    familyId: user.familyId,
    mfaVerified,
  };
}
