import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("password-reset user interface", () => {
  it("places localized recovery directly on the password login form", () => {
    const login = source("src/components/login-form.tsx");
    expect(login).toContain("Forgot your password?");
    expect(login).toContain("¿Olvidaste tu contraseña?");
    expect(login).toContain("/forgot-password?lang=${locale}");
  });

  it("never puts the emailed reset token in a query string or persistent browser storage", () => {
    const resetForm = source("src/components/password-reset-form.tsx");
    const resetService = source("src/lib/auth/password-reset.ts");
    expect(resetForm).toContain("window.location.hash");
    expect(resetForm).toContain("window.history.replaceState");
    expect(resetForm).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
    expect(resetService).toContain("#token=");
    expect(resetService).not.toMatch(/[?&]token=/);
  });

  it("uses password-manager fields, a confirmation, and the staff MFA factor", () => {
    const resetForm = source("src/components/password-reset-form.tsx");
    expect(resetForm.match(/autoComplete="new-password"/g)).toHaveLength(2);
    expect(resetForm).toContain("passwordConfirmation");
    expect(resetForm).toContain("minLength={16}");
    expect(resetForm).toContain("autoComplete=\"one-time-code\"");
  });

  it("keeps recovery pages private from indexes, caches, and referrers", () => {
    for (const page of ["src/app/forgot-password/page.tsx", "src/app/reset-password/page.tsx"]) {
      expect(source(page)).toContain("robots: { index: false, follow: false }");
    }
    const config = source("next.config.ts");
    expect(config).toContain("forgot-password|reset-password");
    expect(config).toContain('value: "no-store, max-age=0"');
    expect(config).toContain('value: "no-referrer"');
  });
});
