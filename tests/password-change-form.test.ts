import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

import {
  PasswordChangeForm,
  passwordChangeFailureMessage,
  validatePasswordChange,
} from "@/components/password-change-form";
import { workspaceLinksFor } from "@/lib/auth/workspace-links";

describe("self-service password change form", () => {
  it("renders three private password fields with reveal controls and no values", () => {
    const html = renderToStaticMarkup(
      createElement(PasswordChangeForm, { locale: "en" }),
    );

    expect(html.match(/type="password"/g)).toHaveLength(3);
    expect(html.match(/type="button"/g)).toHaveLength(3);
    expect(html).toContain('autoComplete="current-password"');
    expect(html.match(/autoComplete="new-password"/g)).toHaveLength(2);
    expect(html).toContain('minLength="16"');
    expect(html).not.toContain('value="');
    expect(html).not.toContain("localStorage");
    expect(html).not.toContain("sessionStorage");
  });

  it("enforces length, confirmation, and password reuse locally", () => {
    expect(validatePasswordChange({
      currentPassword: "current-password-value",
      newPassword: "short",
      confirmPassword: "short",
    }, "en")).toEqual(expect.objectContaining({
      ok: false,
      field: "newPassword",
    }));

    expect(validatePasswordChange({
      currentPassword: "current-password-value",
      newPassword: "different-password-value",
      confirmPassword: "different-password-typo",
    }, "en")).toEqual(expect.objectContaining({
      ok: false,
      field: "confirmPassword",
    }));

    expect(validatePasswordChange({
      currentPassword: "same-password-value",
      newPassword: "same-password-value",
      confirmPassword: "same-password-value",
    }, "en")).toEqual(expect.objectContaining({
      ok: false,
      field: "newPassword",
    }));

    expect(validatePasswordChange({
      currentPassword: "current-password-value",
      newPassword: "new-password-value-2026",
      confirmPassword: "new-password-value-2026",
    }, "en")).toEqual({ ok: true });
  });

  it("uses only trusted response metadata for failures and retry guidance", () => {
    expect(passwordChangeFailureMessage({
      status: 400,
      headers: new Headers({ "Retry-After": "<script>secret</script>" }),
    }, "en")).toBe(
      "The password was not changed. Check the current password and requirements.",
    );

    expect(passwordChangeFailureMessage({
      status: 429,
      headers: new Headers({ "Retry-After": "125" }),
    }, "en")).toBe(
      "Too many attempts. Wait about 3 minutes, then try again.",
    );
  });

  it("makes account security reachable for every authenticated role", () => {
    const links = workspaceLinksFor({
      userId: "user-1",
      email: "family@example.org",
      displayName: "Family member",
      roles: ["family"],
      familyId: "family-1",
      mfaVerified: false,
    }, "en");

    expect(links).toContainEqual(["Security", "/account/security"]);
  });
});
