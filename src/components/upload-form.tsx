"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import type { Locale } from "@/lib/domain/types";
import { FILE_INPUT_ACCEPT, MAX_UPLOAD_BYTES } from "@/lib/uploads/validation";

export interface UploadFamilyOption {
  id: string;
  name: string;
}

export interface UploadSurvivorOption {
  id: string;
  familyId: string;
  name: string;
}

/**
 * Who the form is rendered for. An administrator chooses the family group and
 * survivor from real options; a family contributor is locked to the invited
 * group and only ever sees that group's survivors.
 */
export type UploadFormMode =
  | {
      kind: "admin";
      families: UploadFamilyOption[];
      survivors: UploadSurvivorOption[];
    }
  | {
      kind: "family";
      familyId: string;
      familyName: string;
      survivors: UploadSurvivorOption[];
    };

type SubmitStatus = "idle" | "loading" | "success" | "error";

interface UploadResult {
  error?: string;
  issues?: string[];
  archiveItem?: { id: string; title: string };
}

function formatByteSize(byteSize: number): string {
  if (byteSize >= 1024 * 1024) return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
  if (byteSize >= 1024) return `${Math.round(byteSize / 1024)} KB`;
  return `${byteSize} B`;
}

export function UploadForm({ locale, mode }: { locale: Locale; mode: UploadFormMode }) {
  const spanish = locale === "es";
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [message, setMessage] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const [familyId, setFamilyId] = useState(mode.kind === "family" ? mode.familyId : "");
  const [selectedFile, setSelectedFile] = useState<{ name: string; size: number } | null>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const router = useRouter();

  const survivorOptions = useMemo(() => {
    if (mode.kind === "family") return mode.survivors;
    if (!familyId) return [];
    return mode.survivors.filter((survivor) => survivor.familyId === familyId);
  }, [mode, familyId]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    setSelectedFile(file ? { name: file.name, size: file.size } : null);
    if (file && file.size > MAX_UPLOAD_BYTES) {
      setStatus("error");
      setIssues([]);
      setMessage(
        spanish
          ? `Ese archivo pesa ${formatByteSize(file.size)}; el límite es de 25 MB.`
          : `That file is ${formatByteSize(file.size)}; the limit is 25 MB.`,
      );
    } else if (status === "error") {
      setStatus("idle");
      setMessage("");
      setIssues([]);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = new FormData(form);
    if (mode.kind === "family") body.set("familyId", mode.familyId);

    const file = body.get("file");
    if (file instanceof File && file.size > MAX_UPLOAD_BYTES) {
      setStatus("error");
      setIssues([]);
      setMessage(
        spanish
          ? `Ese archivo pesa ${formatByteSize(file.size)}; el límite es de 25 MB.`
          : `That file is ${formatByteSize(file.size)}; the limit is 25 MB.`,
      );
      return;
    }

    setStatus("loading");
    setMessage("");
    setIssues([]);
    let result: UploadResult;
    let ok = false;
    try {
      const response = await fetch("/api/uploads", { method: "POST", body });
      ok = response.ok;
      result = (await response.json()) as UploadResult;
    } catch {
      result = {
        error: spanish
          ? "La carga no pudo completarse. Revise su conexión e intente de nuevo."
          : "The upload could not be completed. Check your connection and try again.",
      };
    }
    if (!ok) {
      setStatus("error");
      setMessage(result.error ?? (spanish ? "La carga falló." : "Upload failed."));
      setIssues(result.issues ?? []);
      statusRef.current?.focus();
      return;
    }
    setStatus("success");
    setMessage(
      spanish
        ? `El material «${result.archiveItem?.title ?? ""}» quedó guardado de forma privada y pendiente de revisión curatorial.`
        : `“${result.archiveItem?.title ?? ""}” is stored privately and awaits curator review.`,
    );
    setSelectedFile(null);
    form.reset();
    if (mode.kind === "admin") setFamilyId("");
    statusRef.current?.focus();
    // The recent-uploads list and the rail counts are server-rendered.
    router.refresh();
  }

  return (
    <form className="stack-form" onSubmit={submit} encType="multipart/form-data">
      <div className="form-grid">
        {mode.kind === "admin" ? (
          <div className="field">
            <label htmlFor="familyId">{spanish ? "Grupo familiar" : "Family group"}</label>
            <select
              id="familyId"
              name="familyId"
              required
              value={familyId}
              onChange={(event) => setFamilyId(event.currentTarget.value)}
            >
              <option value="">
                {spanish ? "Seleccione un grupo…" : "Choose a group…"}
              </option>
              {mode.families.map((family) => (
                <option key={family.id} value={family.id}>
                  {family.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="field">
            <span className="field-label">{spanish ? "Grupo familiar" : "Family group"}</span>
            <p className="upload-locked-group">{mode.familyName}</p>
          </div>
        )}
        <div className="field">
          <label htmlFor="survivorId">
            {spanish ? "Sobreviviente (opcional)" : "Survivor (optional)"}
          </label>
          <select
            id="survivorId"
            name="survivorId"
            defaultValue=""
            disabled={mode.kind === "admin" && !familyId}
          >
            <option value="">
              {mode.kind === "admin" && !familyId
                ? spanish
                  ? "Elija primero un grupo"
                  : "Choose a group first"
                : spanish
                  ? "Sin sobreviviente específico"
                  : "No specific survivor"}
            </option>
            {survivorOptions.map((survivor) => (
              <option key={survivor.id} value={survivor.id}>
                {survivor.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field span-2">
          <label htmlFor="title">{spanish ? "Título descriptivo" : "Descriptive title"}</label>
          <input
            id="title"
            name="title"
            minLength={3}
            maxLength={180}
            required
            placeholder={
              spanish
                ? "Carta de Stephan a su familia, 1946"
                : "Letter from Stephan to his family, 1946"
            }
          />
        </div>
        <div className="field">
          <label htmlFor="itemType">{spanish ? "Tipo de material" : "Type of material"}</label>
          <select id="itemType" name="itemType" defaultValue="document">
            <option value="document">{spanish ? "Documento" : "Document"}</option>
            <option value="photograph">{spanish ? "Fotografía" : "Photograph"}</option>
            <option value="audio">Audio</option>
            <option value="video">Video</option>
            <option value="artifact">{spanish ? "Objeto" : "Artifact"}</option>
            <option value="other">{spanish ? "Otro" : "Other"}</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="originalLanguage">{spanish ? "Idioma original" : "Original language"}</label>
          <select id="originalLanguage" name="originalLanguage" defaultValue={locale}>
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="other">{spanish ? "Otro" : "Other"}</option>
          </select>
        </div>
        <div className="field span-2">
          <label htmlFor="sourceContributor">
            {spanish ? "Fuente o persona que lo aporta" : "Source or contributor"}
          </label>
          <input
            id="sourceContributor"
            name="sourceContributor"
            minLength={3}
            maxLength={240}
            required
            placeholder={spanish ? "Colección de la familia Jalnos" : "The Jalnos family collection"}
          />
        </div>
        <div className="field">
          <label htmlFor="consentRights">
            {spanish ? "Base de consentimiento" : "Consent basis"}
          </label>
          <select id="consentRights" name="consentRights" defaultValue="permission">
            <option value="owned">{spanish ? "Es propiedad de la familia" : "Owned by the family"}</option>
            <option value="permission">{spanish ? "Con permiso documentado" : "Documented permission"}</option>
            <option value="documented_restriction">
              {spanish ? "Con restricción documentada" : "Documented restriction"}
            </option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="file">{spanish ? "Archivo original" : "Original file"}</label>
          <input
            id="file"
            name="file"
            type="file"
            required
            accept={FILE_INPUT_ACCEPT}
            onChange={handleFileChange}
            aria-describedby="file-hint"
          />
          <p id="file-hint" className="upload-file-hint">
            {selectedFile
              ? `${selectedFile.name} · ${formatByteSize(selectedFile.size)}`
              : spanish
                ? "Fotografías, escaneos, documentos, audio o video · hasta 25 MB"
                : "Photographs, scans, documents, audio, or video · up to 25 MB"}
          </p>
        </div>
        <div className="field span-2">
          <label htmlFor="rightsStatement">
            {spanish
              ? "Declaración de derechos y restricciones"
              : "Rights and restrictions statement"}
          </label>
          <textarea
            id="rightsStatement"
            name="rightsStatement"
            minLength={8}
            maxLength={2000}
            required
            placeholder={
              spanish
                ? "Quién lo posee, quién autorizó compartirlo y qué usos están permitidos o restringidos."
                : "Who holds it, who agreed to share it, and what uses are allowed or restricted."
            }
          />
        </div>
      </div>
      <p className="notice private">
        {spanish
          ? "Esta carga será privada y quedará pendiente de revisión. Cargar material no autoriza su publicación."
          : "This upload stays private and pending review. Uploading does not grant publication permission."}
      </p>
      <button className="button" type="submit" disabled={status === "loading"}>
        {status === "loading"
          ? spanish
            ? "Guardando…"
            : "Saving…"
          : spanish
            ? "Enviar carga privada"
            : "Submit private upload"}
      </button>
      <p
        ref={statusRef}
        tabIndex={-1}
        className={`form-status ${status === "success" ? "success" : status === "error" ? "error" : ""}`}
        role="status"
        aria-live="polite"
      >
        {message}
      </p>
      {issues.length > 0 ? (
        <ul className="upload-issue-list">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
