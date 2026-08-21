"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/domain/types";

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

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
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
        setStatus("error");
        return;
      }
      const result = (await response.json()) as { destination: string };
      router.push(`${result.destination}?lang=${locale}`);
      router.refresh();
    } catch {
      // A dropped connection must return the form to a usable state.
      setStatus("error");
    }
  }

  return (
    <form className="stack-form" onSubmit={submit}>
      <div className="field">
        <label htmlFor="email">{locale === "es" ? "Correo electrónico" : "Email"}</label>
        <input id="email" name="email" type="email" autoComplete="username" required />
      </div>
      <div className="field">
        <label htmlFor="password">{locale === "es" ? "Contraseña" : "Password"}</label>
        <input id="password" name="password" type="password" autoComplete="current-password" minLength={8} required />
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
      {status === "error" ? <p className="form-status error" role="alert">{locale === "es" ? "No fue posible iniciar sesión." : "Sign-in was not successful."}</p> : null}
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
