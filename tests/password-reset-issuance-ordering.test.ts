import { afterEach, describe, expect, it, vi } from "vitest";

const databaseMock = vi.hoisted(() => ({ getDatabase: vi.fn() }));
vi.mock("@/db/client", () => ({ getDatabase: databaseMock.getDatabase }));

import {
  issuePasswordReset,
  type PasswordResetRequestConfiguration,
} from "@/lib/auth/password-reset";

const TOKEN_KEY = "q9Vg3Yp8Kx2Lm7Nd4Rf6Ts1Wc5Zh0BjUaEiOoP";

function configurationWith(
  smtp: Partial<PasswordResetRequestConfiguration["smtp"]> = {},
): PasswordResetRequestConfiguration {
  return {
    siteOrigin: "https://voicesoftheshoah.org",
    tokenKey: TOKEN_KEY,
    smtp: {
      host: "smtp.elasticemail.com",
      port: 2525,
      secure: false,
      requireTLS: true,
      user: "vots-smtp-vgxcdd0e0w@voicesoftheshoah.org",
      password: "credential-under-test",
      from: "no-reply@voicesoftheshoah.org",
      ...smtp,
    },
  };
}

/** Records whether anything was ever written, without granting a working database. */
function unusableDatabase(): { transactionCalls: number } {
  const state = { transactionCalls: 0 };
  databaseMock.getDatabase.mockReturnValue({
    transaction: vi.fn(async () => {
      state.transactionCalls += 1;
      throw new Error("The test database refuses writes.");
    }),
  });
  return state;
}

afterEach(() => {
  vi.restoreAllMocks();
  databaseMock.getDatabase.mockReset();
});

describe("issuePasswordReset commits nothing it cannot deliver", () => {
  // A token row and its auth.password_reset_issued audit are committed together.
  // Anything that can throw between that commit and the send would strand a live
  // token behind an audit trail claiming the reset was issued, with no revoke and
  // no delivery — and it would still count against the per-user active-token cap.
  // canonicalPasswordResetLink re-validates the origin with NODE_ENV pinned to
  // "production", so it is the one step in that window that really can throw.
  it("fails before touching the database when the site origin is not canonical", async () => {
    const state = unusableDatabase();

    await expect(
      issuePasswordReset({
        email: "curator@voicesoftheshoah.org",
        locale: "en",
        configuration: {
          ...configurationWith(),
          siteOrigin: "https://voicesoftheshoah.org/archive",
        },
      }),
    ).rejects.toThrow();

    expect(state.transactionCalls).toBe(0);
  });

  it("reaches the database once the link and transport are both built", async () => {
    const state = unusableDatabase();

    await expect(
      issuePasswordReset({
        email: "curator@voicesoftheshoah.org",
        locale: "en",
        configuration: configurationWith(),
        send: async () => {},
      }),
    ).rejects.toThrow();

    expect(state.transactionCalls).toBe(1);
  });
});
