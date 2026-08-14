import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword, verifyPasswordAsync } from "@/lib/auth/password";

describe("production password hashing", () => {
  it("verifies the intended password and rejects a different password", async () => {
    const hash = hashPassword("a sufficiently long family password", Buffer.alloc(16, 7));
    expect(verifyPassword("a sufficiently long family password", hash)).toBe(true);
    expect(verifyPassword("a different family password", hash)).toBe(false);
    await expect(verifyPasswordAsync("a sufficiently long family password", hash)).resolves.toBe(true);
  });

  it("rejects malformed hashes and weak passwords", () => {
    expect(verifyPassword("anything", "not-a-supported-hash")).toBe(false);
    expect(() => hashPassword("too-short")).toThrow(/between 12 and 200/);
  });
});
