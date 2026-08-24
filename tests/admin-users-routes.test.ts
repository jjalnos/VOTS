import { afterEach, describe, expect, it, vi } from "vitest";

const sessionMock = vi.hoisted(() => ({
  getActorFromRequest: vi.fn(),
}));
const invitationsMock = vi.hoisted(() => ({
  createInvitedUser: vi.fn(),
  issueInvitation: vi.fn(),
  setUserActive: vi.fn(),
}));

vi.mock("@/lib/auth/server-session", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getActorFromRequest: sessionMock.getActorFromRequest,
}));
vi.mock("@/lib/auth/invitations", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createInvitedUser: invitationsMock.createInvitedUser,
  issueInvitation: invitationsMock.issueInvitation,
  setUserActive: invitationsMock.setUserActive,
}));

import { POST as createUser } from "@/app/api/admin/users/route";
import { PATCH as patchUser } from "@/app/api/admin/users/[id]/route";
import { POST as resendInvite } from "@/app/api/admin/users/[id]/invite/route";
import type { Actor } from "@/lib/auth/policy";

const ORIGIN = "https://archive.example";
const USER_ID = "00000000-0000-4000-8000-0000000000ff";
const admin: Actor = {
  userId: "00000000-0000-4000-8000-00000000000a",
  email: "admin@archive.local",
  displayName: "Admin",
  roles: ["admin"],
  mfaVerified: true,
};
const viewer: Actor = { ...admin, roles: ["viewer"] };

function jsonRequest(path: string, body: unknown, origin = ORIGIN): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  email: "eleanor@example.org",
  displayName: "Eleanor Gossen",
  roles: ["admin", "curator"],
  locale: "en",
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function stubPostgres() {
  vi.stubEnv("DATA_ADAPTER", "postgres");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN);
}

describe("admin user routes", () => {
  it("refuses cross-site, anonymous, and non-admin callers", async () => {
    stubPostgres();
    const crossSite = await createUser(jsonRequest("/api/admin/users", validBody, "https://evil.example"));
    expect(crossSite.status).toBe(403);

    sessionMock.getActorFromRequest.mockResolvedValueOnce(null);
    const anonymous = await createUser(jsonRequest("/api/admin/users", validBody));
    expect(anonymous.status).toBe(401);

    sessionMock.getActorFromRequest.mockResolvedValueOnce(viewer);
    const forbidden = await createUser(jsonRequest("/api/admin/users", validBody));
    expect(forbidden.status).toBe(403);
    expect(invitationsMock.createInvitedUser).not.toHaveBeenCalled();
  });

  it("refuses the mock adapter with an honest 503", async () => {
    vi.stubEnv("DATA_ADAPTER", "mock");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN);
    sessionMock.getActorFromRequest.mockResolvedValueOnce(admin);
    const response = await createUser(jsonRequest("/api/admin/users", validBody));
    expect(response.status).toBe(503);
  });

  it("rejects malformed bodies without touching the database", async () => {
    stubPostgres();
    sessionMock.getActorFromRequest.mockResolvedValueOnce(admin);
    const response = await createUser(
      jsonRequest("/api/admin/users", { ...validBody, roles: ["superuser"] }),
    );
    expect(response.status).toBe(400);
    expect(invitationsMock.createInvitedUser).not.toHaveBeenCalled();
  });

  it("guards the state route the same way and surfaces refusals as 409", async () => {
    stubPostgres();
    sessionMock.getActorFromRequest.mockResolvedValue(admin);
    invitationsMock.setUserActive.mockResolvedValueOnce("refused");
    const refused = await patchUser(
      new Request(`${ORIGIN}/api/admin/users/${USER_ID}`, {
        method: "PATCH",
        headers: { Origin: ORIGIN, "Content-Type": "application/json" },
        body: JSON.stringify({ active: false }),
      }),
      { params: Promise.resolve({ id: USER_ID }) },
    );
    expect(refused.status).toBe(409);

    invitationsMock.setUserActive.mockResolvedValueOnce("not-found");
    const missing = await patchUser(
      new Request(`${ORIGIN}/api/admin/users/${USER_ID}`, {
        method: "PATCH",
        headers: { Origin: ORIGIN, "Content-Type": "application/json" },
        body: JSON.stringify({ active: false }),
      }),
      { params: Promise.resolve({ id: USER_ID }) },
    );
    expect(missing.status).toBe(404);
  });

  it("maps resend outcomes onto honest statuses", async () => {
    stubPostgres();
    vi.stubEnv("AUTH_PROVIDER", "database");
    vi.stubEnv("DATABASE_URL", "postgresql://archive:unused@127.0.0.1:5432/archive");
    vi.stubEnv("PASSWORD_RESET_TOKEN_KEY", "q9Vg3Yp8Kx2Lm7Nd4Rf6Ts1Wc5Zh0BjUaEiOoP");
    vi.stubEnv("SMTP_HOST", "smtp.elasticemail.com");
    vi.stubEnv("SMTP_PORT", "2525");
    vi.stubEnv("SMTP_SECURE", "false");
    vi.stubEnv("SMTP_REQUIRE_TLS", "true");
    vi.stubEnv("SMTP_USER", "vots-smtp-4f9a2c1d@voicesoftheshoah.org");
    vi.stubEnv("SMTP_PASSWORD", "unused");
    vi.stubEnv("SMTP_FROM", "no-reply@voicesoftheshoah.org");
    sessionMock.getActorFromRequest.mockResolvedValue(admin);

    invitationsMock.issueInvitation.mockResolvedValueOnce("already-accepted");
    const accepted = await resendInvite(
      new Request(`${ORIGIN}/api/admin/users/${USER_ID}/invite`, {
        method: "POST",
        headers: { Origin: ORIGIN },
      }),
      { params: Promise.resolve({ id: USER_ID }) },
    );
    expect(accepted.status).toBe(409);

    invitationsMock.issueInvitation.mockResolvedValueOnce("issued");
    const issued = await resendInvite(
      new Request(`${ORIGIN}/api/admin/users/${USER_ID}/invite`, {
        method: "POST",
        headers: { Origin: ORIGIN },
      }),
      { params: Promise.resolve({ id: USER_ID }) },
    );
    expect(issued.status).toBe(200);
  });
});
