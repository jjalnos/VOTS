"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/domain/types";

type LoginResponse = Pick<Response, "headers" | "status">;

function retryAfterSeconds(response: LoginResponse): number | null {
  const value = response.headers.get("Retry-After")?.trim();
  if (!value || !/^\d{1,5}$/.test(value)) {
    return null;
  }

  const seconds = Number(value);
  return seconds >= 1 && seconds <= 86_400 ? seconds : null;
}

/**
 * Convert only trusted response metadata into a user-facing message. API error
 * bodies are intentionally ignored so authentication details cannot leak into
 * the sign-in page.
 */
export function loginFailureMessage(response: LoginResponse, locale: Locale) {
  if (response.status !== 429) {
    return locale === "es"
      ? "No fue posible iniciar sesión."
      : "Sign-in was not successful.";
  }

  const seconds = retryAfterSeconds(response);
  if (seconds === null) {
    return locale === "es"
      ? "Demasiados intentos de inicio de sesión. Espera un momento y vuelve a intentarlo."
      : "Too many sign-in attempts. Wait a moment, then try again.";
  }

  if (seconds < 60) {
    return locale === "es"
      ? `Demasiados intentos de inicio de sesión. Espera ${seconds} ${seconds === 1 ? "segundo" : "segundos"} y vuelve a intentarlo.`
      : `Too many sign-in attempts. Wait ${seconds} ${seconds === 1 ? "second" : "seconds"}, then try again.`;
  }

  const minutes = Math.ceil(seconds / 60);
  return locale === "es"
    ? `Demasiados intentos de inicio de sesión. Espera aproximadamente ${minutes} ${minutes === 1 ? "minuto" : "minutos"} y vuelve a intentarlo.`
    : `Too many sign-in attempts. Wait about ${minutes} ${minutes === 1 ? "minute" : "minutes"}, then try again.`;
}

export function LoginForm({
  locale,
  requireStaffMfa,
  showDevelopmentHint,
}: {
  locale: Locale;
  requireStaffMfa: boolean;
  showDevelopmentHint: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setErrorMessage(null);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          password: data.get("password"),
          mfaCode: data.get("mfaCode") || undefined,
        }),
      });
      if (!response.ok) {
        setErrorMessage(loginFailureMessage(response, locale));
        setStatus("error");
        return;
      }
      const result = (await response.json()) as { destination: string };
      router.push(`${result.destination}?lang=${locale}`);
      router.refresh();
    } catch {
      // A dropped connection must return the form to a usable state.
      setErrorMessage(locale === "es" ? "No fue posible iniciar sesión." : "Sign-in was not successful.");
      setStatus("error");
    }
  }

  return (
    <form className="stack-form" onSubmit={submit} aria-busy={status === "loading"}>
      <div className="field">
        <label htmlFor="email">{locale === "es" ? "Correo electrónico" : "Email"}</label>
        <input id="email" name="email" type="email" autoComplete="username" required />
      </div>
      <div className="field">
        <label htmlFor="password">{locale === "es" ? "Contraseña" : "Password"}</label>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "stretch" }}>
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            minLength={8}
            required
            style={{ minWidth: 0 }}
          />
          <button
            type="button"
            aria-controls="password"
            aria-label={locale === "es"
              ? (showPassword ? "Ocultar contraseña" : "Mostrar contraseña")
              : (showPassword ? "Hide password" : "Show password")}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((visible) => !visible)}
            style={{
              minHeight: 48,
              paddingInline: "0.75rem",
              border: 0,
              borderBottom: "1px solid var(--hairline)",
              color: "var(--wine)",
              background: "transparent",
              fontWeight: 750,
              cursor: "pointer",
            }}
          >
            {locale === "es"
              ? (showPassword ? "Ocultar" : "Mostrar")
              : (showPassword ? "Hide" : "Show")}
          </button>
        </div>
      </div>
      {requireStaffMfa ? (
        <div className="field">
          <label htmlFor="mfaCode">{locale === "es" ? "Código MFA (personal solamente)" : "MFA code (staff only)"}</label>
          <input id="mfaCode" name="mfaCode" inputMode="numeric" autoComplete="one-time-code" />
        </div>
      ) : null}
      <button className="button" type="submit" disabled={status === "loading"}>
        {status === "loading" ? (locale === "es" ? "Verificando…" : "Verifying…") : (locale === "es" ? "Entrar" : "Sign in")}
      </button>
      {status === "error" && errorMessage ? (
        <p id="login-error" className="form-status error" role="alert">
          {errorMessage}
        </p>
      ) : null}
      {showDevelopmentHint ? (
        <div className="notice">
          <strong>{locale === "es" ? "Solo desarrollo" : "Development only"}</strong>
          <p>family@archive.local / family-demo</p>
          <p>curator@archive.local / curator-demo{requireStaffMfa ? " / MFA 000000" : ""}</p>
          <p>admin@archive.local / admin-demo{requireStaffMfa ? " / MFA 000000" : ""}</p>
        </div>
      ) : null}
    </form>
  );
}
