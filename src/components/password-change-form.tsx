"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "@/components/password-change-form.module.css";
import type { Locale } from "@/lib/domain/types";

type PasswordField = "currentPassword" | "newPassword" | "confirmPassword";
type FormStatus = "idle" | "loading" | "error" | "success";
type PasswordChangeResponse = Pick<Response, "headers" | "status">;

interface PasswordValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export type PasswordValidation =
  | { ok: true }
  | { ok: false; field: PasswordField; message: string };

export function validatePasswordChange(
  values: PasswordValues,
  locale: Locale,
): PasswordValidation {
  const es = locale === "es";
  if (!values.currentPassword || values.currentPassword.length > 200) {
    return {
      ok: false,
      field: "currentPassword",
      message: es ? "Escriba su contraseña actual." : "Enter your current password.",
    };
  }
  if (values.newPassword.length < 16 || values.newPassword.length > 200) {
    return {
      ok: false,
      field: "newPassword",
      message: es
        ? "La nueva contraseña debe tener entre 16 y 200 caracteres."
        : "The new password must contain 16 to 200 characters.",
    };
  }
  if (!values.confirmPassword) {
    return {
      ok: false,
      field: "confirmPassword",
      message: es ? "Confirme la nueva contraseña." : "Confirm the new password.",
    };
  }
  if (values.newPassword !== values.confirmPassword) {
    return {
      ok: false,
      field: "confirmPassword",
      message: es
        ? "Las nuevas contraseñas no coinciden."
        : "The new passwords do not match.",
    };
  }
  if (values.newPassword === values.currentPassword) {
    return {
      ok: false,
      field: "newPassword",
      message: es
        ? "La nueva contraseña debe ser diferente de la contraseña actual."
        : "The new password must differ from the current password.",
    };
  }
  return { ok: true };
}

function retryAfterSeconds(response: PasswordChangeResponse): number | null {
  const value = response.headers.get("Retry-After")?.trim();
  if (!value || !/^\d{1,5}$/.test(value)) return null;
  const seconds = Number(value);
  return seconds >= 1 && seconds <= 3_600 ? seconds : null;
}

export function passwordChangeFailureMessage(
  response: PasswordChangeResponse,
  locale: Locale,
): string {
  const es = locale === "es";
  if (response.status === 401) {
    return es
      ? "Su sesión terminó. Inicie sesión de nuevo antes de cambiar la contraseña."
      : "Your session ended. Sign in again before changing your password.";
  }
  if (response.status === 429) {
    const seconds = retryAfterSeconds(response);
    if (seconds === null) {
      return es
        ? "Demasiados intentos. Espere un momento y vuelva a intentarlo."
        : "Too many attempts. Wait a moment, then try again.";
    }
    if (seconds < 60) {
      const unit = es
        ? (seconds === 1 ? "segundo" : "segundos")
        : (seconds === 1 ? "second" : "seconds");
      return es
        ? "Demasiados intentos. Espere " + seconds + " " + unit + " y vuelva a intentarlo."
        : "Too many attempts. Wait " + seconds + " " + unit + ", then try again.";
    }
    const minutes = Math.ceil(seconds / 60);
    const unit = es
      ? (minutes === 1 ? "minuto" : "minutos")
      : (minutes === 1 ? "minute" : "minutes");
    return es
      ? "Demasiados intentos. Espere aproximadamente " + minutes + " " + unit + " y vuelva a intentarlo."
      : "Too many attempts. Wait about " + minutes + " " + unit + ", then try again.";
  }
  if (response.status === 503) {
    return es
      ? "El cambio de contraseña no está disponible temporalmente."
      : "Password change is temporarily unavailable.";
  }
  return es
    ? "No se pudo cambiar la contraseña. Verifique la contraseña actual y los requisitos."
    : "The password was not changed. Check the current password and requirements.";
}

function PasswordInput({
  field,
  label,
  locale,
  visible,
  toggle,
  autoComplete,
  minLength,
  hint,
  disabled,
  error,
  inputRef,
}: {
  field: PasswordField;
  label: string;
  locale: Locale;
  visible: boolean;
  toggle: () => void;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
  hint?: string;
  disabled: boolean;
  error?: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const hintId = hint ? field + "-hint" : undefined;
  const errorId = error ? field + "-error" : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const actionLabel = locale === "es"
    ? (visible ? "Ocultar " : "Mostrar ") + label.toLocaleLowerCase("es")
    : (visible ? "Hide " : "Show ") + label.toLocaleLowerCase("en");

  return (
    <div className="field">
      <label htmlFor={field}>{label}</label>
      <div className={styles.passwordControl}>
        <input
          ref={inputRef}
          id={field}
          name={field}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={minLength}
          maxLength={200}
          required
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        <button
          className={styles.reveal}
          type="button"
          aria-controls={field}
          aria-label={actionLabel}
          aria-pressed={visible}
          onClick={toggle}
          disabled={disabled}
        >
          {locale === "es"
            ? (visible ? "Ocultar" : "Mostrar")
            : (visible ? "Hide" : "Show")}
        </button>
      </div>
      {hint ? <p id={hintId} className={styles.hint}>{hint}</p> : null}
      {error
        ? <p id={errorId} className={styles.fieldError} role="alert">{error}</p>
        : null}
    </div>
  );
}

export function PasswordChangeForm({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [status, setStatus] = useState<FormStatus>("idle");
  const [serverError, setServerError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{
    field: PasswordField;
    message: string;
  } | null>(null);
  const [visible, setVisible] = useState<Record<PasswordField, boolean>>({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });
  const currentPasswordRef = useRef<HTMLInputElement>(null);
  const newPasswordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const redirectTimerRef = useRef<number | null>(null);
  const es = locale === "es";
  const disabled = status === "loading" || status === "success";

  useEffect(() => () => {
    requestRef.current?.abort();
    if (redirectTimerRef.current !== null) {
      window.clearTimeout(redirectTimerRef.current);
    }
  }, []);

  function focusField(field: PasswordField) {
    const refs = {
      currentPassword: currentPasswordRef,
      newPassword: newPasswordRef,
      confirmPassword: confirmPasswordRef,
    };
    window.requestAnimationFrame(() => refs[field].current?.focus());
  }

  function toggle(field: PasswordField) {
    setVisible((current) => ({ ...current, [field]: !current[field] }));
  }

  function resetSecrets(form: HTMLFormElement) {
    form.reset();
    setVisible({
      currentPassword: false,
      newPassword: false,
      confirmPassword: false,
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const values: PasswordValues = {
      currentPassword: String(data.get("currentPassword") ?? ""),
      newPassword: String(data.get("newPassword") ?? ""),
      confirmPassword: String(data.get("confirmPassword") ?? ""),
    };
    const validation = validatePasswordChange(values, locale);
    setServerError(null);
    if (!validation.ok) {
      setFieldError({ field: validation.field, message: validation.message });
      focusField(validation.field);
      return;
    }

    setFieldError(null);
    setStatus("loading");
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        }),
        cache: "no-store",
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      resetSecrets(form);
      if (!response.ok) {
        setServerError(passwordChangeFailureMessage(response, locale));
        setStatus("error");
        focusField("currentPassword");
        return;
      }

      setStatus("success");
      redirectTimerRef.current = window.setTimeout(() => {
        router.replace("/login?lang=" + locale);
        router.refresh();
      }, 2_000);
    } catch {
      if (controller.signal.aborted) return;
      resetSecrets(form);
      setServerError(es
        ? "No se pudo cambiar la contraseña. Inténtelo de nuevo."
        : "The password could not be changed. Try again.");
      setStatus("error");
      focusField("currentPassword");
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  return (
    <form
      className={styles.form}
      onSubmit={submit}
      noValidate
      aria-busy={status === "loading"}
    >
      <PasswordInput
        field="currentPassword"
        label={es ? "Contraseña actual" : "Current password"}
        locale={locale}
        visible={visible.currentPassword}
        toggle={() => toggle("currentPassword")}
        autoComplete="current-password"
        disabled={disabled}
        error={fieldError?.field === "currentPassword" ? fieldError.message : undefined}
        inputRef={currentPasswordRef}
      />
      <PasswordInput
        field="newPassword"
        label={es ? "Nueva contraseña" : "New password"}
        locale={locale}
        visible={visible.newPassword}
        toggle={() => toggle("newPassword")}
        autoComplete="new-password"
        minLength={16}
        hint={es ? "Entre 16 y 200 caracteres." : "Use 16 to 200 characters."}
        disabled={disabled}
        error={fieldError?.field === "newPassword" ? fieldError.message : undefined}
        inputRef={newPasswordRef}
      />
      <PasswordInput
        field="confirmPassword"
        label={es ? "Confirmar nueva contraseña" : "Confirm new password"}
        locale={locale}
        visible={visible.confirmPassword}
        toggle={() => toggle("confirmPassword")}
        autoComplete="new-password"
        minLength={16}
        disabled={disabled}
        error={fieldError?.field === "confirmPassword" ? fieldError.message : undefined}
        inputRef={confirmPasswordRef}
      />
      <div className={styles.actions}>
        <button className="button" type="submit" disabled={disabled}>
          {status === "loading"
            ? (es ? "Cambiando…" : "Changing…")
            : (es ? "Cambiar contraseña" : "Change password")}
        </button>
      </div>
      {serverError
        ? <p className="form-status error" role="alert">{serverError}</p>
        : null}
      {status === "success"
        ? (
          <p className={styles.success} role="status">
            {es
              ? "Contraseña cambiada. Todas las sesiones se revocaron, incluida esta. Será redirigido para iniciar sesión con la nueva contraseña."
              : "Password changed. Every session was revoked, including this one. You will be redirected to sign in with the new password."}
          </p>
        )
        : null}
    </form>
  );
}
