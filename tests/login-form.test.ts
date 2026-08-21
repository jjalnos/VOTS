import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { LoginForm, loginFailureMessage } from "@/components/login-form";

describe("login form", () => {
  it.each([
    ["en", "Show password"],
    ["es", "Mostrar contraseña"],
  ] as const)("renders an accessible password reveal control in %s", (locale, label) => {
    const html = renderToStaticMarkup(createElement(LoginForm, {
      locale,
      requireStaffMfa: false,
      showDevelopmentHint: false,
    }));

    expect(html).toContain('type="password"');
    expect(html).toContain('aria-controls="password"');
    expect(html).toContain(`aria-label="${label}"`);
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('type="button"');
  });

  it("communicates a safe retry delay after rate limiting", () => {
    const response = {
      status: 429,
      headers: new Headers({ "Retry-After": "125" }),
    };

    expect(loginFailureMessage(response, "en")).toBe(
      "Too many sign-in attempts. Wait about 3 minutes, then try again.",
    );
    expect(loginFailureMessage(response, "es")).toBe(
      "Demasiados intentos de inicio de sesión. Espera aproximadamente 3 minutos y vuelve a intentarlo.",
    );
  });

  it("keeps authentication failures generic", () => {
    const response = {
      status: 401,
      headers: new Headers({ "Retry-After": "999" }),
    };

    expect(loginFailureMessage(response, "en")).toBe("Sign-in was not successful.");
    expect(loginFailureMessage(response, "es")).toBe("No fue posible iniciar sesión.");
  });

  it("does not display malformed retry metadata", () => {
    const response = {
      status: 429,
      headers: new Headers({ "Retry-After": "<script>alert(1)</script>" }),
    };

    const message = loginFailureMessage(response, "en");
    expect(message).toBe("Too many sign-in attempts. Wait a moment, then try again.");
    expect(message).not.toContain("script");
  });
});
