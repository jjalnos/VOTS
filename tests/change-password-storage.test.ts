import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

const databaseMock = vi.hoisted(() => ({
  getDatabase: vi.fn(),
}));

vi.mock("@/db/client", () => ({
  getDatabase: databaseMock.getDatabase,
}));

import { changeDatabaseUserPassword } from "@/lib/auth/change-password";

const userId = "00000000-0000-4000-8000-000000000001";
const currentPassword = "current-password-value";
const newPassword = "new-password-value-2026";

interface FakeTransactionState {
  auditValue?: Record<string, unknown>;
  updateValue?: Record<string, unknown>;
  transactionCalls: number;
}

function fakeDatabase(options: {
  passwordHash?: string | null;
  activeIdentity?: boolean;
  updateCompletes?: boolean;
} = {}): FakeTransactionState {
  const state: FakeTransactionState = { transactionCalls: 0 };
  const identityRows = options.activeIdentity === false
    ? []
    : [{ id: userId, passwordHash: options.passwordHash ?? hashPassword(currentPassword) }];

  const transaction = {
    select: vi.fn(() => {
      const builder = {
        from: vi.fn(() => builder),
        where: vi.fn(() => builder),
        for: vi.fn(() => builder),
        limit: vi.fn(async () => identityRows),
      };
      return builder;
    }),
    update: vi.fn(() => {
      const builder = {
        set: vi.fn((value: Record<string, unknown>) => {
          state.updateValue = value;
          return builder;
        }),
        where: vi.fn(() => builder),
        returning: vi.fn(async () =>
          options.updateCompletes === false ? [] : [{ id: userId }]),
      };
      return builder;
    }),
    insert: vi.fn(() => ({
      values: vi.fn(async (value: Record<string, unknown>) => {
        state.auditValue = value;
      }),
    })),
  };

  databaseMock.getDatabase.mockReturnValue({
    transaction: vi.fn(async (callback: (value: typeof transaction) => unknown) => {
      state.transactionCalls += 1;
      return callback(transaction);
    }),
  });
  return state;
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://database.example/archive");
  databaseMock.getDatabase.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("database password change", () => {
  it("updates the scrypt hash, increments session version, and writes a secret-free audit event atomically", async () => {
    const state = fakeDatabase();

    const result = await changeDatabaseUserPassword({
      userId,
      currentPassword,
      newPassword,
    });

    expect(result).toBe("changed");
    expect(state.transactionCalls).toBe(1);
    expect(typeof state.updateValue?.passwordHash).toBe("string");
    expect(verifyPassword(newPassword, String(state.updateValue?.passwordHash))).toBe(true);
    expect(state.updateValue?.sessionVersion).toBeDefined();
    expect(state.auditValue).toMatchObject({
      actorUserId: userId,
      action: "identity.password_changed",
      entityType: "user",
      entityId: userId,
      metadata: {
        method: "authenticated-self-service",
        sessionsRevoked: true,
      },
    });
    const auditJson = JSON.stringify(state.auditValue);
    expect(auditJson).not.toContain(currentPassword);
    expect(auditJson).not.toContain(newPassword);
    expect(auditJson).not.toMatch(/passwordHash|currentPassword|newPassword/);
  });

  it("collapses an incorrect current password, inactive identity, and password reuse to one rejection", async () => {
    const wrongState = fakeDatabase();
    const wrong = await changeDatabaseUserPassword({
      userId,
      currentPassword: "incorrect-current-password",
      newPassword,
    });
    expect(wrong).toBe("rejected");
    expect(wrongState.updateValue).toBeUndefined();

    const inactiveState = fakeDatabase({ activeIdentity: false });
    const inactive = await changeDatabaseUserPassword({
      userId,
      currentPassword,
      newPassword,
    });
    expect(inactive).toBe("rejected");
    expect(inactiveState.updateValue).toBeUndefined();

    const reusedState = fakeDatabase();
    const reused = await changeDatabaseUserPassword({
      userId,
      currentPassword,
      newPassword: currentPassword,
    });
    expect(reused).toBe("rejected");
    expect(reusedState.updateValue).toBeUndefined();
  });

  it("fails closed without database configuration or when the transaction cannot complete", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await expect(changeDatabaseUserPassword({
      userId,
      currentPassword,
      newPassword,
    })).resolves.toBe("unavailable");
    expect(databaseMock.getDatabase).not.toHaveBeenCalled();

    vi.stubEnv("DATABASE_URL", "postgres://database.example/archive");
    fakeDatabase({ updateCompletes: false });
    await expect(changeDatabaseUserPassword({
      userId,
      currentPassword,
      newPassword,
    })).resolves.toBe("unavailable");
  });
});
