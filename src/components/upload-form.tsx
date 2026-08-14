"use client";

import { useState } from "react";
import type { Locale } from "@/lib/domain/types";

export function UploadForm({ locale, familyId }: { locale: Locale; familyId?: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    const form = event.currentTarget;
    const body = new FormData(form);
    if (familyId) body.set("familyId", familyId);
    const response = await fetch("/api/uploads", { method: "POST", body });
    const result = (await response.json()) as { error?: string; archiveItem?: { id: string } };
    if (!response.ok) {
      setStatus("error");
      setMessage(result.error ?? "Upload failed.");
      return;
    }
    setStatus("success");
    setMessage(locale === "es" ? `Carga privada recibida: ${result.archiveItem?.id}` : `Private upload received: ${result.archiveItem?.id}`);
    form.reset();
  }

  return (
    <form className="stack-form" onSubmit={submit} encType="multipart/form-data">
      <div className="form-grid">
        {!familyId ? <div className="field"><label htmlFor="familyId">{locale === "es" ? "ID del grupo familiar" : "Family group ID"}</label><input id="familyId" name="familyId" required /></div> : null}
        <div className="field"><label htmlFor="survivorId">{locale === "es" ? "ID de sobreviviente (opcional)" : "Survivor ID (optional)"}</label><input id="survivorId" name="survivorId" /></div>
        <div className="field span-2"><label htmlFor="title">{locale === "es" ? "Título descriptivo" : "Descriptive title"}</label><input id="title" name="title" minLength={3} maxLength={180} required /></div>
        <div className="field"><label htmlFor="itemType">{locale === "es" ? "Tipo" : "Type"}</label><select id="itemType" name="itemType" defaultValue="document"><option value="document">Document</option><option value="photograph">Photograph</option><option value="audio">Audio</option><option value="video">Video</option><option value="artifact">Artifact</option><option value="other">Other</option></select></div>
        <div className="field"><label htmlFor="originalLanguage">{locale === "es" ? "Idioma original" : "Original language"}</label><select id="originalLanguage" name="originalLanguage" defaultValue={locale}><option value="en">English</option><option value="es">Español</option><option value="other">Other / Otro</option></select></div>
        <div className="field span-2"><label htmlFor="sourceContributor">{locale === "es" ? "Fuente o colaborador" : "Source or contributor"}</label><input id="sourceContributor" name="sourceContributor" required /></div>
        <div className="field"><label htmlFor="consentRights">{locale === "es" ? "Base de consentimiento/derechos" : "Consent/rights basis"}</label><select id="consentRights" name="consentRights" defaultValue="permission"><option value="owned">Owned / Propiedad</option><option value="permission">Permission / Permiso</option><option value="documented_restriction">Documented restriction / Restricción</option></select></div>
        <div className="field"><label htmlFor="file">{locale === "es" ? "Archivo original" : "Original file"}</label><input id="file" name="file" type="file" required /></div>
        <div className="field span-2"><label htmlFor="rightsStatement">{locale === "es" ? "Declaración de derechos y restricciones" : "Rights and restrictions statement"}</label><textarea id="rightsStatement" name="rightsStatement" minLength={8} maxLength={2000} required /></div>
      </div>
      <p className="notice private">{locale === "es" ? "Esta carga será privada y pendiente de revisión. Cargar no concede permiso para publicar." : "This upload will be private and pending review. Uploading does not grant publication permission."}</p>
      <button className="button" type="submit" disabled={status === "loading"}>{status === "loading" ? (locale === "es" ? "Guardando…" : "Saving…") : (locale === "es" ? "Enviar carga privada" : "Submit private upload")}</button>
      {message ? <p className={`form-status ${status === "success" ? "success" : "error"}`} role="status">{message}</p> : null}
    </form>
  );
}
