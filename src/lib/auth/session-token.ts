import { createHmac, timingSafeEqual } from "node:crypto";
import type { Actor } from "@/lib/auth/policy";
import { ROLES } from "@/lib/domain/types";

export interface SessionPayload extends Actor {
  sessionVersion: number;
  issuedAt: number;
  expiresAt: number;
}

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signSession(payload: SessionPayload, secret: string): string {
  const encoded = encode(JSON.stringify(payload));
  return `${encoded}.${signature(encoded, secret)}`;
}

export function verifySession(
  token: string | undefined,
  secret: string | undefined,
  now = Date.now(),
): SessionPayload | null {
  if (!token || !secret) return null;
  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra) return null;
  const expectedSignature = signature(encoded, secret);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    if (
      typeof payload.userId !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.displayName !== "string" ||
      typeof payload.mfaVerified !== "boolean" ||
      !Number.isSafeInteger(payload.sessionVersion) ||
      payload.sessionVersion < 1 ||
      !Array.isArray(payload.roles) ||
      !payload.roles.every((role) => ROLES.includes(role)) ||
      typeof payload.issuedAt !== "number" ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt <= now ||
      payload.issuedAt > now + 60_000
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
