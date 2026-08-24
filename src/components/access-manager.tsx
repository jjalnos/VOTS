"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { StatusPill } from "@/components/status-pill";
import type { Locale, Role, User } from "@/lib/domain/types";

interface FamilyOption {
  id: string;
  name: string;
}

/** The role shapes the invite form offers, in the order they are offered. */
const ROLE_CHOICES: Array<{ key: string; roles: Role[]; en: string; es: string }> = [
  { key: "admin-curator", roles: ["admin", "curator"], en: "Administrator + Curator", es: "Administración + Curaduría" },
  { key: "admin", roles: ["admin"], en: "Administrator", es: "Administración" },
  { key: "curator", roles: ["curator"], en: "Curator", es: "Curaduría" },
  { key: "family", roles: ["family"], en: "Family contributor", es: "Contribución familiar" },
  { key: "viewer", roles: ["viewer"], en: "Viewer (read-only registry)", es: "Visualización (registro de solo lectura)" },
];

const ROLE_LABELS: Record<Role, { en: string; es: string }> = {
  admin: { en: "Administrator", es: "Administración" },
  curator: { en: "Curator", es: "Curaduría" },
  family: { en: "Family", es: "Familia" },
  viewer: { en: "Viewer", es: "Visualización" },
};

function roleList(roles: Role[], locale: Locale): string {
  return roles.map((role) => ROLE_LABELS[role][locale]).join(", ") || "—";
}

/**
 * The API speaks English; a Spanish reader gets the known cases in Spanish
 * and the raw server sentence only as a last resort.
 */
function localizedError(status: number, serverMessage: string | undefined, spanish: boolean): string {
  if (!spanish) return serverMessage ?? "The request failed.";
  if (serverMessage?.includes("already exists")) {
    return "Ya existe una cuenta con ese correo electrónico.";
  }
  if (serverMessage?.includes("already has a password")) {
    return "Esta cuenta ya tiene contraseña; use el restablecimiento de contraseña.";
  }
  if (serverMessage?.includes("MFA enforcement")) {
    return "Las invitaciones de personal no están disponibles mientras MFA esté obligatorio.";
  }
  if (status === 409) {
    return "No puede desactivar su propia cuenta ni la última cuenta administradora activa.";
  }
  if (status === 502) {
    return "El correo de invitación no pudo entregarse.";
  }
  if (status === 503) {
    return "Esta función no está disponible en este entorno.";
  }
  return serverMessage ?? "La solicitud falló.";
}

export function AccessManager({
  locale,
  users,
  families,
  selfId,
  writable,
}: {
  locale: Locale;
  users: User[];
  families: FamilyOption[];
  selfId: string;
  /** False when the environment has no database; the form explains instead of failing. */
  writable: boolean;
}) {
  const spanish = locale === "es";
  const router = useRouter();
  const [roleChoice, setRoleChoice] = useState("");
  const [status, setStatus] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [rowPending, setRowPending] = useState<string | null>(null);

  const needsFamily = roleChoice === "family";

  async function submitInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const choice = ROLE_CHOICES.find((candidate) => candidate.key === roleChoice);
    if (!choice) return;
    setPending(true);
    setStatus(null);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: String(data.get("email") ?? ""),
          displayName: String(data.get("displayName") ?? ""),
          roles: choice.roles,
          ...(needsFamily ? { familyId: String(data.get("familyId") ?? "") } : {}),
          locale: String(data.get("emailLocale") ?? "en"),
        }),
      });
      const result = (await response.json()) as { error?: string; invitation?: string };
      if (!response.ok) {
        setStatus({ tone: "error", message: localizedError(response.status, result.error, spanish) });
        return;
      }
      const sent = result.invitation === "issued";
      setStatus({
        tone: "success",
        message: sent
          ? spanish
            ? "Cuenta creada. La invitación con el enlace para elegir contraseña ya fue enviada."
            : "Account created. The invitation with the choose-a-password link is on its way."
          : spanish
            ? "Cuenta creada, pero el correo de invitación no pudo enviarse. Use «Reenviar invitación»."
            : "Account created, but the invitation email could not be sent. Use “Resend invitation”.",
      });
      form.reset();
      setRoleChoice("");
      router.refresh();
    } catch {
      setStatus({ tone: "error", message: spanish ? "La invitación falló." : "The invitation failed." });
    } finally {
      setPending(false);
    }
  }

  async function rowAction(userId: string, action: "resend" | "activate" | "deactivate") {
    setRowPending(userId);
    setStatus(null);
    try {
      const response =
        action === "resend"
          ? await fetch(`/api/admin/users/${userId}/invite`, { method: "POST" })
          : await fetch(`/api/admin/users/${userId}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ active: action === "activate" }),
            });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setStatus({ tone: "error", message: localizedError(response.status, result.error, spanish) });
        return;
      }
      setStatus({
        tone: "success",
        message:
          action === "resend"
            ? spanish
              ? "Invitación reenviada."
              : "Invitation resent."
            : action === "deactivate"
              ? spanish
                ? "Cuenta desactivada; sus sesiones quedaron cerradas."
                : "Account deactivated; its sessions are now closed."
              : spanish
                ? "Cuenta reactivada."
                : "Account reactivated.",
      });
      router.refresh();
    } catch {
      setStatus({ tone: "error", message: spanish ? "La acción falló." : "The action failed." });
    } finally {
      setRowPending(null);
    }
  }

  return (
    <div className="access-manager">
      <article className="card">
        <h2>{spanish ? "Invitar a una persona" : "Invite someone"}</h2>
        <p>
          {spanish
            ? "La cuenta se crea sin contraseña. La persona recibe un correo con la marca del archivo y elige su propia contraseña con un enlace válido por 7 días."
            : "The account is created without a password. The person receives a branded email and chooses their own password with a link that stays valid for 7 days."}
        </p>
        {writable ? (
          <form className="stack-form" onSubmit={submitInvite}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="invite-name">{spanish ? "Nombre" : "Name"}</label>
                <input id="invite-name" name="displayName" minLength={2} maxLength={180} required />
              </div>
              <div className="field">
                <label htmlFor="invite-email">{spanish ? "Correo electrónico" : "Email"}</label>
                <input id="invite-email" name="email" type="email" maxLength={320} required />
              </div>
              <div className="field">
                <label htmlFor="invite-role">{spanish ? "Rol" : "Role"}</label>
                <select
                  id="invite-role"
                  value={roleChoice}
                  required
                  onChange={(event) => setRoleChoice(event.currentTarget.value)}
                >
                  <option value="" disabled>
                    {spanish ? "Seleccione un rol…" : "Choose a role…"}
                  </option>
                  {ROLE_CHOICES.map((choice) => (
                    <option key={choice.key} value={choice.key}>
                      {spanish ? choice.es : choice.en}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="invite-locale">{spanish ? "Idioma del correo" : "Email language"}</label>
                <select id="invite-locale" name="emailLocale" defaultValue={locale}>
                  <option value="en">English</option>
                  <option value="es">Español</option>
                </select>
              </div>
              {needsFamily ? (
                <div className="field span-2">
                  <label htmlFor="invite-family">{spanish ? "Grupo familiar" : "Family group"}</label>
                  <select id="invite-family" name="familyId" required defaultValue="">
                    <option value="" disabled>
                      {spanish ? "Seleccione un grupo…" : "Choose a group…"}
                    </option>
                    {families.map((family) => (
                      <option key={family.id} value={family.id}>
                        {family.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
            <button className="button" type="submit" disabled={pending}>
              {pending
                ? spanish
                  ? "Enviando…"
                  : "Sending…"
                : spanish
                  ? "Crear cuenta y enviar invitación"
                  : "Create account and send invitation"}
            </button>
          </form>
        ) : (
          <p className="notice">
            {spanish
              ? "Este entorno de desarrollo no tiene base de datos; las invitaciones solo funcionan en producción."
              : "This development environment has no database; invitations only work in production."}
          </p>
        )}
        <p
          className={`form-status ${status?.tone ?? ""}`}
          role="status"
          aria-live="polite"
        >
          {status?.message ?? ""}
        </p>
      </article>

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{spanish ? "Cuenta" : "Account"}</th>
              <th>{spanish ? "Roles" : "Roles"}</th>
              <th>{spanish ? "Estado" : "Status"}</th>
              <th>{spanish ? "Acciones" : "Actions"}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const invited = user.hasPassword === false;
              const busy = rowPending === user.id;
              return (
                <tr key={user.id}>
                  <td>
                    <strong>{user.displayName}</strong>
                    <br />
                    {user.email}
                  </td>
                  <td>{roleList(user.roles, locale)}</td>
                  <td>
                    <StatusPill tone={user.active ? (invited ? "pending" : "approved") : "private"}>
                      {user.active
                        ? invited
                          ? spanish
                            ? "Invitación pendiente"
                            : "Invitation pending"
                          : spanish
                            ? "Activa"
                            : "Active"
                        : spanish
                          ? "Desactivada"
                          : "Deactivated"}
                    </StatusPill>
                    {user.mfaRequired ? (
                      <span className="access-mfa-note">
                        {spanish ? "MFA requerido" : "MFA required"}
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <div className="access-actions">
                      {writable && invited && user.active ? (
                        <button
                          className="button secondary"
                          type="button"
                          disabled={busy}
                          onClick={() => rowAction(user.id, "resend")}
                        >
                          {spanish ? "Reenviar invitación" : "Resend invitation"}
                        </button>
                      ) : null}
                      {writable && user.id !== selfId ? (
                        <button
                          className="button secondary"
                          type="button"
                          disabled={busy}
                          onClick={() => rowAction(user.id, user.active ? "deactivate" : "activate")}
                        >
                          {user.active
                            ? spanish
                              ? "Desactivar"
                              : "Deactivate"
                            : spanish
                              ? "Reactivar"
                              : "Reactivate"}
                        </button>
                      ) : null}
                      {user.id === selfId ? (
                        <span className="access-self-note">{spanish ? "Usted" : "You"}</span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
