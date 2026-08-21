"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/domain/types";

type ResetStatus = "loading-token" | "ready" | "submitting" | "invalid" | "rejected" | "mismatch" | "error" | "success";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function PasswordResetForm({ locale }: { locale: Locale }) {
  const capturedToken = useRef<string | null | undefined>(undefined);
  const invalidRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<ResetStatus>("loading-token");

  useEffect(() => {
    if (capturedToken.current === undefined) {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      capturedToken.current = fragment.get("token");
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
    const suppliedToken = capturedToken.current;
    const update = window.setTimeout(() => {
      if (!suppliedToken || !TOKEN_PATTERN.test(suppliedToken)) {
        setStatus("invalid");
        return;
      }
      setToken(suppliedToken);
      setStatus("ready");
    }, 0);
    return () => window.clearTimeout(update);
  }, []);

  useEffect(() => {
    if (status === "invalid") invalidRef.current?.focus();
    if (status === "success") successRef.current?.focus();
    if (status === "mismatch") confirmationRef.current?.focus();
    if (["rejected", "error"].includes(status)) errorRef.current?.focus();
  }, [status]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;
    if (!token) {
      setStatus("invalid");
      return;
    }

    const form = event.currentTarget;
    const data = new FormData(form);
    const password = String(data.get("password") ?? "");
    const passwordConfirmation = String(data.get("passwordConfirmation") ?? "");
    if (password !== passwordConfirmation) {
      setStatus("mismatch");
      return;
    }

    setStatus("submitting");
    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          password,
          passwordConfirmation,
          mfaCode: data.get("mfaCode") || undefined,
        }),
      });
      if (!response.ok) {
        setStatus(response.status === 400 ? "rejected" : "error");
        return;
      }
      form.reset();
      setToken(null);
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  if (status === "loading-token") {
    return <p className="form-status" role="status">{locale === "es" ? "Preparando…" : "Preparing…"}</p>;
  }

  if (status === "invalid") {
    return (
      <div className="notice private" role="alert" ref={invalidRef} tabIndex={-1}>
        <strong>{locale === "es" ? "El enlace no es válido" : "That link isn’t valid"}</strong>
        <p>
          {locale === "es"
            ? "El enlace puede haber vencido o ya fue utilizado. Solicita uno nuevo."
            : "The link may have expired or already been used. Request a new one."}
        </p>
        <Link className="signin-back" href={`/forgot-password?lang=${locale}`}>
          {locale === "es" ? "Solicitar otro enlace" : "Request another link"}
        </Link>
      </div>
    );
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
        <strong>{locale === "es" ? "Contraseña actualizada" : "Password updated"}</strong>
        <p>
          {locale === "es"
            ? "Tu contraseña se cambió y tus sesiones anteriores se cerraron."
            : "Your password was changed and your previous sessions were signed out."}
        </p>
        <Link className="button" href={`/login?lang=${locale}`}>
          {locale === "es" ? "Iniciar sesión" : "Sign in"}
        </Link>
      </div>
    );
  }

  return (
    <>
    <form className="stack-form" onSubmit={submit} aria-busy={status === "submitting"}>
      <div className="field">
        <label htmlFor="new-password">
          {locale === "es" ? "Nueva contraseña" : "New password"}
        </label>
        <input
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={16}
          maxLength={200}
          aria-invalid={status === "mismatch"}
          aria-describedby={
            status === "mismatch"
              ? "password-requirements reset-form-message"
              : "password-requirements"
          }
          required
        />
      </div>
      <p id="password-requirements" className="signin-field-note">
        {locale === "es" ? "Usa entre 16 y 200 caracteres." : "Use 16–200 characters."}
      </p>
      <div className="field">
        <label htmlFor="confirm-password">
          {locale === "es" ? "Confirmar contraseña" : "Confirm password"}
        </label>
        <input
          id="confirm-password"
          name="passwordConfirmation"
          type="password"
          ref={confirmationRef}
          autoComplete="new-password"
          minLength={16}
          maxLength={200}
          aria-invalid={status === "mismatch"}
          aria-describedby={status === "mismatch" ? "reset-form-message" : undefined}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="reset-mfa-code">
          {locale === "es" ? "Código MFA (solo personal)" : "MFA code (staff only)"}
        </label>
        <input
          id="reset-mfa-code"
          name="mfaCode"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6,12}"
          minLength={6}
          maxLength={12}
          aria-describedby="reset-mfa-help"
        />
      </div>
      <p id="reset-mfa-help" className="signin-field-note">
        {locale === "es"
          ? "Personal: ingresa tu código MFA de 6 a 12 dígitos. Familias: déjalo en blanco."
          : "Staff: enter your 6–12 digit MFA code. Family accounts: leave this blank."}
      </p>
      <button className="button" type="submit" aria-disabled={status === "submitting"}>
        {status === "submitting"
          ? locale === "es" ? "Actualizando…" : "Updating…"
          : locale === "es" ? "Actualizar contraseña" : "Update password"}
      </button>
      <p className="sr-only" role="status" aria-live="polite">
        {status === "submitting"
          ? locale === "es" ? "Actualizando la contraseña." : "Updating the password."
          : ""}
      </p>
      {status === "mismatch" ? (
        <p
          id="reset-form-message"
          className="form-status error"
          role="alert"
          ref={errorRef}
          tabIndex={-1}
        >
          {locale === "es"
            ? "Las contraseñas deben coincidir."
            : "The passwords must match."}
        </p>
      ) : null}
      {status === "rejected" ? (
        <>
        <p
          id="reset-form-message"
          className="form-status error"
          role="alert"
          ref={errorRef}
          tabIndex={-1}
        >
          {locale === "es"
            ? "No se aceptó el enlace o el código MFA. Verifica el código o solicita un enlace nuevo."
            : "The link or MFA code was not accepted. Check the code or request a new link."}
        </p>
        <Link className="signin-back" href={`/forgot-password?lang=${locale}`}>
          {locale === "es" ? "Solicitar un enlace nuevo" : "Request a new link"}
        </Link>
        </>
      ) : null}
      {status === "error" ? (
        <p
          id="reset-form-message"
          className="form-status error"
          role="alert"
          ref={errorRef}
          tabIndex={-1}
        >
          {locale === "es"
            ? "No fue posible actualizar la contraseña. Inténtalo de nuevo."
            : "The password could not be updated. Please try again."}
        </p>
      ) : null}
    </form>
    <Link className="signin-back signin-secondary-link" href={`/login?lang=${locale}`}>
      ← {locale === "es" ? "Volver a iniciar sesión" : "Back to sign in"}
    </Link>
    </>
  );
}
