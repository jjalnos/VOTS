import { afterEach, describe, expect, it, vi } from "vitest";

const databaseMock = vi.hoisted(() => ({
  getDatabase: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getDatabase: databaseMock.getDatabase,
}));

import type { Actor } from "@/lib/auth/policy";
import {
  createInvitedUser,
  INVITATION_TTL_MS,
  InvitationAuthorizationError,
  InvitationValidationError,
  invitationEmail,
  issueInvitation,
  normalizeInvitedUserInput,
  setUserActive,
} from "@/lib/auth/invitations";
import type { PasswordResetRequestConfiguration } from "@/lib/auth/password-reset";
import type { EmailMessage } from "@/lib/email/smtp";

const admin: Actor = {
  userId: "00000000-0000-4000-8000-00000000000a",
  email: "admin@archive.local",
  displayName: "Admin",
  roles: ["admin"],
  mfaVerified: true,
};
const adminWithoutMfa: Actor = { ...admin, mfaVerified: false };
const curator: Actor = { ...admin, roles: ["curator"] };

const configuration: PasswordResetRequestConfiguration = {
  siteOrigin: "https://archive.example",
  tokenKey: "q9Vg3Yp8Kx2Lm7Nd4Rf6Ts1Wc5Zh0BjUaEiOoP",
  smtp: {
    host: "smtp.elasticemail.com",
    port: 2525,
    secure: false,
    requireTLS: true,
    user: "vots-smtp-4f9a2c1d@voicesoftheshoah.org",
    password: "not-used-by-these-tests",
    from: "no-reply@voicesoftheshoah.org",
  },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("invitation input validation", () => {
  const base = {
    email: "Person@Example.org ",
    displayName: " Eleanor Gossen ",
    roles: ["admin", "curator"] as Actor["roles"],
    locale: "en" as const,
  };

  it("normalizes email casing and trims the display name", () => {
    const normalized = normalizeInvitedUserInput(base);
    expect(normalized.email).toBe("person@example.org");
    expect(normalized.displayName).toBe("Eleanor Gossen");
  });

  it("requires a family group for family contributors and refuses staff mixes", () => {
    expect(() =>
      normalizeInvitedUserInput({ ...base, roles: ["family"] }),
    ).toThrow(InvitationValidationError);
    expect(() =>
      normalizeInvitedUserInput({ ...base, roles: ["family", "curator"], familyId: "f" }),
    ).toThrow(InvitationValidationError);
    expect(
      normalizeInvitedUserInput({ ...base, roles: ["family"], familyId: "family-1" }).familyId,
    ).toBe("family-1");
  });

  it("refuses a family group on staff accounts and empty role lists", () => {
    expect(() =>
      normalizeInvitedUserInput({ ...base, familyId: "family-1" }),
    ).toThrow(InvitationValidationError);
    expect(() => normalizeInvitedUserInput({ ...base, roles: [] })).toThrow(
      InvitationValidationError,
    );
  });

  it("flattens control characters out of display names", () => {
    const normalized = normalizeInvitedUserInput({
      ...base,
      displayName: "Eleanor\r\nBcc: attacker@evil.example\u0000 Gossen",
    });
    expect(normalized.displayName).toBe("Eleanor Bcc: attacker@evil.example Gossen");
  });

  it("refuses staff invitations while staff MFA enforcement is on", () => {
    vi.stubEnv("STAFF_MFA_REQUIRED", "true");
    try {
      expect(() => normalizeInvitedUserInput(base)).toThrow(/MFA enforcement/);
      expect(
        normalizeInvitedUserInput({ ...base, roles: ["viewer"] }).roles,
      ).toEqual(["viewer"]);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("refuses invalid addresses and names", () => {
    expect(() => normalizeInvitedUserInput({ ...base, email: "not-an-email" })).toThrow(
      InvitationValidationError,
    );
    expect(() => normalizeInvitedUserInput({ ...base, displayName: "x" })).toThrow(
      InvitationValidationError,
    );
  });
});

describe("invitation email", () => {
  it("brands both parts and carries the first-password link", () => {
    const message = invitationEmail({
      locale: "en",
      displayName: "Eleanor Gossen",
      inviteLink: "https://archive.example/reset-password?lang=en#token=abc",
    });
    expect(message.subject).toContain("invitation");
    expect(message.text).toContain("VOICES OF THE SHOAH");
    expect(message.text).toContain("Eleanor Gossen");
    expect(message.text).toContain("https://archive.example/reset-password?lang=en#token=abc");
    expect(message.text).toContain("7 days");
    expect(message.html).toContain("Voices of the Shoah");
    expect(message.html).toContain("Choose my password");
  });

  it("localizes the Spanish variant", () => {
    const message = invitationEmail({
      locale: "es",
      displayName: "Eleanor Gossen",
      inviteLink: "https://archive.example/reset-password?lang=es#token=abc",
    });
    expect(message.subject).toContain("invitación");
    expect(message.text).toContain("7 días");
    expect(message.html).toContain("Elegir mi contraseña");
  });

  it("keeps the invitation window at seven days", () => {
    expect(INVITATION_TTL_MS).toBe(7 * 24 * 60 * 60 * 1_000);
  });
});

interface InvitationFakeOptions {
  existingEmail?: boolean;
  familyExists?: boolean;
}

function fakeCreateDatabase(options: InvitationFakeOptions = {}) {
  const inserts: Array<{ table: unknown; value: unknown }> = [];
  let selectCall = 0;
  const transaction = {
    select: vi.fn(() => {
      const call = (selectCall += 1);
      const builder = {
        from: vi.fn(() => builder),
        where: vi.fn(() => builder),
        limit: vi.fn(async () => {
          if (call === 1) return options.existingEmail ? [{ id: "existing" }] : [];
          return options.familyExists === false ? [] : [{ id: "family-1" }];
        }),
      };
      return builder;
    }),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((value: unknown) => {
        inserts.push({ table, value });
        return {
          returning: vi.fn(async () => [{ id: "00000000-0000-4000-8000-0000000000ff" }]),
          then: (resolve: (value: unknown) => unknown) => resolve(undefined),
        };
      }),
    })),
  };
  databaseMock.getDatabase.mockReturnValue({
    transaction: vi.fn(async (callback: (value: typeof transaction) => unknown) =>
      callback(transaction),
    ),
  });
  return { inserts };
}

describe("createInvitedUser", () => {
  const input = {
    email: "eleanor@example.org",
    displayName: "Eleanor Gossen",
    roles: ["admin", "curator"] as Actor["roles"],
    locale: "en" as const,
  };

  it("requires manage_access with MFA", async () => {
    await expect(createInvitedUser(curator, input)).rejects.toThrow(
      InvitationAuthorizationError,
    );
    await expect(createInvitedUser(adminWithoutMfa, input)).rejects.toThrow(
      InvitationAuthorizationError,
    );
  });

  it("creates the account without a password and audits the inviter", async () => {
    const { inserts } = fakeCreateDatabase();
    const invited = await createInvitedUser(admin, input, new Date("2026-08-23T00:00:00Z"));
    expect(invited.email).toBe("eleanor@example.org");
    expect(inserts.length).toBe(3);
    const userInsert = inserts[0].value as { passwordHash: unknown; active: boolean };
    expect(userInsert.passwordHash).toBeNull();
    expect(userInsert.active).toBe(true);
    const roleInsert = inserts[1].value as Array<{ role: string; grantedBy: string }>;
    expect(roleInsert.map((row) => row.role).sort()).toEqual(["admin", "curator"]);
    expect(roleInsert.every((row) => row.grantedBy === admin.userId)).toBe(true);
    const auditInsert = inserts[2].value as { action: string; actorUserId: string };
    expect(auditInsert.action).toBe("identity.user_invited");
    expect(auditInsert.actorUserId).toBe(admin.userId);
  });

  it("refuses a duplicate email", async () => {
    fakeCreateDatabase({ existingEmail: true });
    await expect(createInvitedUser(admin, input)).rejects.toThrow(/already exists/);
  });
});

interface IssueFakeOptions {
  target?: {
    active?: boolean;
    passwordHash?: string | null;
  } | null;
  activeTokens?: number;
}

function fakeIssueDatabase(options: IssueFakeOptions = {}) {
  const inserts: Array<Record<string, unknown>> = [];
  const sent: Array<Record<string, unknown>> = [];
  let selectCall = 0;
  const transaction = {
    select: vi.fn(() => {
      const call = (selectCall += 1);
      const builder = {
        from: vi.fn(() => builder),
        where: vi.fn(() => builder),
        for: vi.fn(() => builder),
        limit: vi.fn(async () => {
          if (call === 1) {
            if (options.target === null) return [];
            return [
              {
                id: "00000000-0000-4000-8000-0000000000ff",
                email: "eleanor@example.org",
                displayName: "Eleanor Gossen",
                active: options.target?.active ?? true,
                passwordHash: options.target?.passwordHash ?? null,
                sessionVersion: 4,
              },
            ];
          }
          // The locale lookup from the invitation audit event.
          return [{ metadata: { locale: "en" } }];
        }),
      };
      // The token-count query resolves through the same builder; drizzle's
      // count() select ends at .where() in the real code, so make the builder
      // awaitable with the configured count.
      (builder as { then?: unknown }).then = (
        resolve: (value: Array<{ value: number }>) => unknown,
      ) => resolve([{ value: options.activeTokens ?? 0 }]);
      return builder;
    }),
    insert: vi.fn(() => ({
      values: vi.fn((value: Record<string, unknown>) => {
        inserts.push(value);
        return {
          returning: vi.fn(async () => [{ id: "token-1" }]),
          then: (resolve: (value: unknown) => unknown) => resolve(undefined),
        };
      }),
    })),
    update: vi.fn(() => {
      const builder = {
        set: vi.fn(() => builder),
        where: vi.fn(async () => undefined),
      };
      return builder;
    }),
  };
  databaseMock.getDatabase.mockReturnValue({
    transaction: vi.fn(async (callback: (value: typeof transaction) => unknown) =>
      callback(transaction),
    ),
  });
  const send = vi.fn(async (message: EmailMessage) => {
    sent.push(message as unknown as Record<string, unknown>);
  });
  return { inserts, sent, send };
}

describe("issueInvitation", () => {
  it("emails a branded first-password link to an invited account", async () => {
    const { sent, send } = fakeIssueDatabase();
    const status = await issueInvitation({
      actor: admin,
      userId: "00000000-0000-4000-8000-0000000000ff",
      configuration,
      send,
    });
    expect(status).toBe("issued");
    expect(sent).toHaveLength(1);
    expect(String(sent[0].subject)).toContain("invitation");
    expect(String(sent[0].text)).toContain("/reset-password?lang=en&invited=1#token=");
    expect(String(sent[0].html)).toContain("Choose my password");
  });

  it("refuses accounts that already hold a password", async () => {
    const { send } = fakeIssueDatabase({ target: { passwordHash: "hash" } });
    const status = await issueInvitation({
      actor: admin,
      userId: "00000000-0000-4000-8000-0000000000ff",
      configuration,
      send,
    });
    expect(status).toBe("already-accepted");
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses inactive or missing accounts and token floods", async () => {
    const missing = fakeIssueDatabase({ target: null });
    expect(
      await issueInvitation({ actor: admin, userId: "00000000-0000-4000-8000-0000000000ff", configuration, send: missing.send }),
    ).toBe("ineligible");

    const inactive = fakeIssueDatabase({ target: { active: false } });
    expect(
      await issueInvitation({ actor: admin, userId: "00000000-0000-4000-8000-0000000000ff", configuration, send: inactive.send }),
    ).toBe("ineligible");

    const flooded = fakeIssueDatabase({ activeTokens: 3 });
    expect(
      await issueInvitation({ actor: admin, userId: "00000000-0000-4000-8000-0000000000ff", configuration, send: flooded.send }),
    ).toBe("ineligible");
  });

  it("revokes the token when delivery fails", async () => {
    const { send } = fakeIssueDatabase();
    send.mockRejectedValueOnce(new Error("smtp down"));
    const status = await issueInvitation({
      actor: admin,
      userId: "00000000-0000-4000-8000-0000000000ff",
      configuration,
      send,
    });
    expect(status).toBe("delivery-failed");
  });

  it("requires manage_access", async () => {
    await expect(
      issueInvitation({ actor: curator, userId: "x", configuration }),
    ).rejects.toThrow(InvitationAuthorizationError);
  });
});

interface StateFakeOptions {
  target?: { active: boolean } | null;
  otherAdmins?: number;
}

function fakeStateDatabase(options: StateFakeOptions = {}) {
  const updates: Array<Record<string, unknown>> = [];
  const audits: Array<Record<string, unknown>> = [];
  let selectCall = 0;
  const transaction = {
    select: vi.fn(() => {
      const call = (selectCall += 1);
      const builder = {
        from: vi.fn(() => builder),
        innerJoin: vi.fn(() => builder),
        where: vi.fn(() => builder),
        for: vi.fn(() => builder),
        limit: vi.fn(async () =>
          options.target === null
            ? []
            : [{ id: "target", active: options.target?.active ?? true }],
        ),
      };
      (builder as { then?: unknown }).then = (
        resolve: (value: Array<{ value: number }>) => unknown,
      ) => resolve([{ value: options.otherAdmins ?? 1 }]);
      void call;
      return builder;
    }),
    update: vi.fn(() => {
      const builder = {
        set: vi.fn((value: Record<string, unknown>) => {
          updates.push(value);
          return builder;
        }),
        where: vi.fn(async () => undefined),
      };
      return builder;
    }),
    insert: vi.fn(() => ({
      values: vi.fn(async (value: Record<string, unknown>) => {
        audits.push(value);
      }),
    })),
    execute: vi.fn(async () => undefined),
  };
  databaseMock.getDatabase.mockReturnValue({
    transaction: vi.fn(async (callback: (value: typeof transaction) => unknown) =>
      callback(transaction),
    ),
  });
  return { updates, audits };
}

describe("setUserActive", () => {
  const targetId = "00000000-0000-4000-8000-0000000000ff";

  it("never lets an administrator deactivate themselves", async () => {
    fakeStateDatabase();
    const outcome = await setUserActive({ actor: admin, userId: admin.userId, active: false });
    expect(outcome).toBe("refused");
  });

  it("never deactivates the last active administrator", async () => {
    fakeStateDatabase({ otherAdmins: 0 });
    const outcome = await setUserActive({ actor: admin, userId: targetId, active: false });
    expect(outcome).toBe("refused");
  });

  it("deactivates with a session-version bump and an audit event", async () => {
    const { updates, audits } = fakeStateDatabase({ otherAdmins: 1 });
    const outcome = await setUserActive({ actor: admin, userId: targetId, active: false });
    expect(outcome).toBe("updated");
    expect(updates[0]).toHaveProperty("sessionVersion");
    expect(updates[0]).toHaveProperty("active", false);
    expect(audits[0]).toHaveProperty("action", "identity.user_deactivated");
  });

  it("reactivates without the last-admin guard", async () => {
    const { audits } = fakeStateDatabase({ target: { active: false }, otherAdmins: 0 });
    const outcome = await setUserActive({ actor: admin, userId: targetId, active: true });
    expect(outcome).toBe("updated");
    expect(audits[0]).toHaveProperty("action", "identity.user_reactivated");
  });
});
