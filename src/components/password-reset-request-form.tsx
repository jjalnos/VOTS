"use client";

import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/domain/types";

type RequestStatus = "idle" | "loading" | "success" | "error";

export function PasswordResetRequestForm({ locale }: { locale: Locale }) {
  const successRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [status, setStatus] = useState<RequestStatus>("idle");

  useEffect(() => {
    if (status === "success") successRef.current?.focus();
    if (status === "error") errorRef.current?.focus();
  }, [status]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    const data = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), locale }),
      });
      setStatus(response.status === 202 ? "success" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div
        className="notice success"
        role="status"
        aria-live="polite"
        ref={successRef}
        tabIndex={-1}
      >
        <strong>{locale === "es" ? "Revisa tu correo" : "Check your email"}</strong>
        <p>
          {locale === "es"
            ? "Si existe una cuenta elegible para esa dirección, recibirás un enlace para restablecer tu contraseña. El enlace vence en 30 minutos."
            : "If an eligible account exists for that address, you’ll receive a password-reset link. The link expires in 30 minutes."}
        </p>
      </div>
    );
  }

  return (
    <form className="stack-form" onSubmit={submit} aria-busy={status === "loading"}>
      <div className="field">
        <label htmlFor="reset-email">
          {locale === "es" ? "Correo electrónico" : "Email"}
        </label>
        <input
          id="reset-email"
          name="email"
          type="email"
          autoComplete="email"
          maxLength={320}
          required
        />
      </div>
      <button className="button" type="submit" aria-disabled={status === "loading"}>
        {status === "loading"
          ? locale === "es" ? "Enviando…" : "Sending…"
          : locale === "es" ? "Enviar enlace" : "Send reset link"}
      </button>
      <p className="sr-only" role="status" aria-live="polite">
        {status === "loading"
          ? locale === "es" ? "Enviando el enlace de restablecimiento." : "Sending the reset link."
          : ""}
      </p>
      {status === "error" ? (
        <p
          id="reset-request-error"
          className="form-status error"
          role="alert"
          ref={errorRef}
          tabIndex={-1}
        >
          {locale === "es"
            ? "El restablecimiento de contraseña no está disponible temporalmente. Inténtalo de nuevo más tarde."
            : "Password reset is temporarily unavailable. Please try again later."}
        </p>
      ) : null}
    </form>
  );
}
