import { afterEach, describe, expect, it, vi } from "vitest";

const databaseMock = vi.hoisted(() => ({
  getDatabase: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getDatabase: databaseMock.getDatabase,
}));

import {
  confirmPasswordReset,
  generatePasswordResetToken,
  passwordResetTokenDigest,
} from "@/lib/auth/password-reset";

const TOKEN_KEY = "q9Vg3Yp8Kx2Lm7Nd4Rf6Ts1Wc5Zh0BjUaEiOoP";
const USER_ID = "00000000-0000-4000-8000-0000000000ff";
const NOW = new Date("2026-08-23T12:00:00Z");
const EXPIRES = new Date("2026-08-24T12:00:00Z");

/**
 * A first-password acceptance: the invited identity has passwordHash null
 * everywhere. The fake follows the real call order — preflight join select,
 * roles select, then the transaction's identity lock, token lock, claim
 * update, password update, sibling revoke, and audit insert.
 */
function fakeAcceptanceDatabase(tokenHash: string) {
  const userUpdates: Array<Record<string, unknown>> = [];
  const audits: Array<Record<string, unknown>> = [];
  let rootSelect = 0;
  let txSelect = 0;
  let txUpdate = 0;

  const root = {
    select: vi.fn(() => {
      const call = (rootSelect += 1);
      const builder = {
        from: vi.fn(() => builder),
        innerJoin: vi.fn(() => builder),
        where: vi.fn(() => builder),
        limit: vi.fn(async () =>
          call === 1
            ? [
                {
                  userId: USER_ID,
                  sessionVersionAtIssue: 1,
                  expiresAt: EXPIRES,
                  usedAt: null,
                  revokedAt: null,
                  active: true,
                  passwordHash: null,
                  sessionVersion: 1,
                  mfaRequired: false,
                  mfaProviderReference: null,
                },
              ]
            : [],
        ),
      };
      // The roles select for MFA preflight resolves via await on where().
      (builder as { then?: unknown }).then = (
        resolve: (value: Array<{ role: string }>) => unknown,
      ) => resolve([{ role: "admin" }, { role: "curator" }]);
      return builder;
    }),
    transaction: vi.fn(
      async (callback: (transaction: unknown) => unknown) => callback(transaction),
    ),
  };

  const transaction = {
    select: vi.fn(() => {
      const call = (txSelect += 1);
      const builder = {
        from: vi.fn(() => builder),
        where: vi.fn(() => builder),
        for: vi.fn(() => builder),
        limit: vi.fn(async () => {
          if (call === 1) {
            return [
              {
                id: USER_ID,
                active: true,
                passwordHash: null,
                sessionVersion: 1,
                mfaRequired: false,
                mfaProviderReference: null,
              },
            ];
          }
          return [
            {
              tokenId: "token-1",
              userId: USER_ID,
              sessionVersionAtIssue: 1,
              expiresAt: EXPIRES,
              usedAt: null,
              revokedAt: null,
            },
          ];
        }),
      };
      (builder as { then?: unknown }).then = (
        resolve: (value: Array<{ role: string }>) => unknown,
      ) => resolve([{ role: "admin" }, { role: "curator" }]);
      return builder;
    }),
    update: vi.fn(() => {
      const call = (txUpdate += 1);
      const builder = {
        set: vi.fn((value: Record<string, unknown>) => {
          if (call === 2) userUpdates.push(value);
          return builder;
        }),
        where: vi.fn(() => builder),
        returning: vi.fn(async () => [{ id: call === 1 ? "token-1" : USER_ID }]),
      };
      (builder as { then?: unknown }).then = (resolve: (value: unknown) => unknown) =>
        resolve(undefined);
      return builder;
    }),
    insert: vi.fn(() => ({
      values: vi.fn(async (value: Record<string, unknown>) => {
        audits.push(value);
      }),
    })),
  };

  databaseMock.getDatabase.mockReturnValue(root);
  void tokenHash;
  return { userUpdates, audits };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("invitation acceptance through the reset flow", () => {
  it("lets an invited identity with no password set its first one", async () => {
    const generated = generatePasswordResetToken(TOKEN_KEY);
    const { userUpdates } = fakeAcceptanceDatabase(
      passwordResetTokenDigest(generated.token, TOKEN_KEY),
    );
    const status = await confirmPasswordReset({
      token: generated.token,
      password: "a first archive password",
      passwordConfirmation: "a first archive password",
      configuration: { siteOrigin: "https://archive.example", tokenKey: TOKEN_KEY },
      now: NOW,
    });
    expect(status).toBe("reset");
    expect(userUpdates).toHaveLength(1);
    expect(userUpdates[0]).toHaveProperty("passwordHash");
    expect(userUpdates[0].passwordHash).toBeTruthy();
  });
});
