"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import type { Locale } from "@/lib/domain/types";
import styles from "./registry-workbook-import.module.css";

interface ChangeSample {
  id: string;
  name: string;
  kind: "new" | "updated" | "unchanged";
  changedFields: string[];
}

interface PreviewResponse {
  stage: "preview";
  filename: string;
  sheetName: string;
  sheets: Array<{ name: string; people: number; selected: boolean; reason?: string }>;
  totals: {
    people: number;
    survivors: number;
    deceased: number;
    families: number;
    withEmail: number;
    withCamps: number;
  };
  warnings: string[];
  summary: { new: number; updated: number; unchanged: number; absent: number };
  samples: { new: ChangeSample[]; updated: ChangeSample[] };
}

interface AppliedResponse {
  stage: "applied";
  filename: string;
  sheetName: string;
  result: { created: number; updated: number; unchanged: number };
  storage: string;
}

const FIELD_LABELS: Record<string, Record<Locale, string>> = {
  firstName: { en: "first name", es: "nombre" },
  lastName: { en: "last name", es: "apellido" },
  title: { en: "title", es: "título" },
  generation: { en: "generation", es: "generación" },
  familyThread: { en: "family reference", es: "referencia familiar" },
  familyKey: { en: "family", es: "familia" },
  countryOfOrigin: { en: "country of origin", es: "país de origen" },
  dateOfBirth: { en: "date of birth", es: "fecha de nacimiento" },
  dateOfDeath: { en: "date of death", es: "fecha de fallecimiento" },
  address: { en: "address", es: "dirección" },
  city: { en: "city", es: "ciudad" },
  state: { en: "state", es: "estado" },
  zip: { en: "ZIP", es: "código postal" },
  email: { en: "email", es: "correo" },
  phone: { en: "phone", es: "teléfono" },
  deceased: { en: "memorial status", es: "estado conmemorativo" },
  camps: { en: "camps", es: "campos" },
};

interface ImportCopy {
  kicker: string;
  heading: string;
  intro: string;
  chooseFile: string;
  noFile: string;
  review: string;
  reviewing: string;
  reviewTitle: (sheet: string) => string;
  sheetsHeading: string;
  peopleInFile: string;
  newRecords: string;
  updatedRecords: string;
  unchangedRecords: string;
  absentRecords: string;
  absentNote: string;
  samplesNew: string;
  samplesUpdated: string;
  warningsHeading: string;
  apply: string;
  applying: string;
  cancel: string;
  appliedTitle: string;
  appliedBody: (created: number, updated: number) => string;
  failure: string;
  more: (count: number) => string;
  safety: string;
}

function copyFor(locale: Locale): ImportCopy {
  if (locale === "es") {
    return {
      kicker: "Importar libro de trabajo",
      heading: "Traiga su hoja de Excel al registro.",
      intro:
        "Suba el archivo .xlsx. Primero verá exactamente qué cambiaría; nada se guarda hasta que usted lo confirme.",
      chooseFile: "Elegir archivo .xlsx",
      noFile: "Ningún archivo seleccionado",
      review: "Revisar cambios",
      reviewing: "Leyendo el libro…",
      reviewTitle: (sheet) => `Vista previa de la hoja “${sheet}”`,
      sheetsHeading: "Hojas encontradas",
      peopleInFile: "Personas en el archivo",
      newRecords: "Nuevas",
      updatedRecords: "Actualizadas",
      unchangedRecords: "Sin cambios",
      absentRecords: "Solo en el registro",
      absentNote:
        "Estas personas no están en el archivo y se conservan intactas. La importación nunca borra.",
      samplesNew: "Ejemplos de personas nuevas",
      samplesUpdated: "Ejemplos de correcciones",
      warningsHeading: "Filas que necesitan su atención",
      apply: "Guardar en el registro",
      applying: "Guardando…",
      cancel: "Cancelar",
      appliedTitle: "Registro actualizado",
      appliedBody: (created, updated) =>
        `${created} personas nuevas y ${updated} corregidas. Sus notas de curaduría se conservaron.`,
      failure: "No se pudo leer el libro de trabajo.",
      more: (count) => `…y ${count} más`,
      safety:
        "La importación añade y corrige. Nunca elimina personas ni borra las notas que usted escribió.",
    };
  }
  return {
    kicker: "Workbook import",
    heading: "Bring your Excel sheet into the register.",
    intro:
      "Upload the .xlsx file. You'll see exactly what would change first — nothing is saved until you confirm.",
    chooseFile: "Choose .xlsx file",
    noFile: "No file chosen",
    review: "Review changes",
    reviewing: "Reading the workbook…",
    reviewTitle: (sheet) => `Preview of sheet “${sheet}”`,
    sheetsHeading: "Sheets found",
    peopleInFile: "People in the file",
    newRecords: "New",
    updatedRecords: "Corrected",
    unchangedRecords: "Unchanged",
    absentRecords: "Only in the register",
    absentNote:
      "These people are not in the file and are kept exactly as they are. An import never deletes.",
    samplesNew: "Examples of new people",
    samplesUpdated: "Examples of corrections",
    warningsHeading: "Rows that need your eye",
    apply: "Save to the register",
    applying: "Saving…",
    cancel: "Cancel",
    appliedTitle: "Register updated",
    appliedBody: (created, updated) =>
      `${created} people added and ${updated} corrected. Your curatorial notes were preserved.`,
    failure: "The workbook could not be read.",
    more: (count) => `…and ${count} more`,
    safety:
      "An import adds and corrects. It never removes people and never overwrites notes you have written.",
  };
}

export function RegistryWorkbookImport({ locale }: { locale: Locale }) {
  const router = useRouter();
  const copy = copyFor(locale);
  const fieldId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<"idle" | "reviewing" | "preview" | "applying" | "applied">("idle");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [applied, setApplied] = useState<AppliedResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  async function send(confirmed: boolean) {
    if (!file) return;
    const body = new FormData();
    body.append("workbook", file, file.name);
    if (confirmed) body.append("confirm", "APPLY_WORKBOOK_IMPORT");
    setStage(confirmed ? "applying" : "reviewing");
    setErrorMessage("");
    try {
      const response = await fetch("/api/curator/registry/import", { method: "POST", body });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          typeof payload === "object" && payload !== null && "error" in payload
            ? String((payload as { error: unknown }).error)
            : copy.failure;
        setErrorMessage(message);
        setStage(preview && confirmed ? "preview" : "idle");
        return;
      }
      if (confirmed) {
        setApplied(payload as AppliedResponse);
        setStage("applied");
        setPreview(null);
        router.refresh();
      } else {
        setPreview(payload as PreviewResponse);
        setStage("preview");
      }
    } catch {
      setErrorMessage(copy.failure);
      setStage(preview && confirmed ? "preview" : "idle");
    }
  }

  function reset() {
    setPreview(null);
    setApplied(null);
    setFile(null);
    setStage("idle");
    setErrorMessage("");
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <section className={styles.panel} aria-labelledby={`${fieldId}-heading`}>
      <div className={styles.header}>
        <p className={styles.kicker}>{copy.kicker}</p>
        <h3 id={`${fieldId}-heading`}>{copy.heading}</h3>
        <p className={styles.intro}>{copy.intro}</p>
      </div>

      <div className={styles.picker}>
        <label className={styles.fileButton} htmlFor={`${fieldId}-file`}>
          {copy.chooseFile}
        </label>
        <input
          ref={inputRef}
          id={`${fieldId}-file`}
          className={styles.fileInput}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setPreview(null);
            setApplied(null);
            setStage("idle");
            setErrorMessage("");
          }}
        />
        <span className={styles.filename}>{file ? file.name : copy.noFile}</span>
        <button
          type="button"
          className={styles.primary}
          disabled={!file || stage === "reviewing" || stage === "applying"}
          onClick={() => void send(false)}
        >
          {stage === "reviewing" ? copy.reviewing : copy.review}
        </button>
      </div>

      <p className={styles.safety}>{copy.safety}</p>

      {errorMessage ? (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      ) : null}

      {stage === "applied" && applied ? (
        <div className={styles.applied} role="status">
          <strong>{copy.appliedTitle}</strong>
          <p>{copy.appliedBody(applied.result.created, applied.result.updated)}</p>
          <button type="button" className={styles.secondary} onClick={reset}>
            {copy.cancel}
          </button>
        </div>
      ) : null}

      {preview ? (
        <div className={styles.preview}>
          <h4>{copy.reviewTitle(preview.sheetName)}</h4>

          <dl className={styles.summary}>
            <div>
              <dt>{copy.peopleInFile}</dt>
              <dd>{preview.totals.people}</dd>
            </div>
            <div className={styles.new}>
              <dt>{copy.newRecords}</dt>
              <dd>{preview.summary.new}</dd>
            </div>
            <div className={styles.updated}>
              <dt>{copy.updatedRecords}</dt>
              <dd>{preview.summary.updated}</dd>
            </div>
            <div>
              <dt>{copy.unchangedRecords}</dt>
              <dd>{preview.summary.unchanged}</dd>
            </div>
            <div>
              <dt>{copy.absentRecords}</dt>
              <dd>{preview.summary.absent}</dd>
            </div>
          </dl>
          {preview.summary.absent > 0 ? <p className={styles.note}>{copy.absentNote}</p> : null}

          {preview.sheets.length > 1 ? (
            <details className={styles.sheets}>
              <summary>{copy.sheetsHeading}</summary>
              <ul>
                {preview.sheets.map((sheet) => (
                  <li key={sheet.name}>
                    <strong>{sheet.name}</strong> — {sheet.people}
                    {sheet.selected ? " ✓" : sheet.reason ? ` · ${sheet.reason}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {preview.samples.new.length ? (
            <div className={styles.sample}>
              <h5>{copy.samplesNew}</h5>
              <ul>
                {preview.samples.new.map((change) => (
                  <li key={change.id}>{change.name}</li>
                ))}
                {preview.summary.new > preview.samples.new.length ? (
                  <li className={styles.more}>
                    {copy.more(preview.summary.new - preview.samples.new.length)}
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {preview.samples.updated.length ? (
            <div className={styles.sample}>
              <h5>{copy.samplesUpdated}</h5>
              <ul>
                {preview.samples.updated.map((change) => (
                  <li key={change.id}>
                    {change.name}
                    <span className={styles.fields}>
                      {" — "}
                      {change.changedFields
                        .map((field) => FIELD_LABELS[field]?.[locale] ?? field)
                        .join(", ")}
                    </span>
                  </li>
                ))}
                {preview.summary.updated > preview.samples.updated.length ? (
                  <li className={styles.more}>
                    {copy.more(preview.summary.updated - preview.samples.updated.length)}
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {preview.warnings.length ? (
            <details className={styles.warnings}>
              <summary>
                {copy.warningsHeading} ({preview.warnings.length})
              </summary>
              <ul>
                {preview.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </details>
          ) : null}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primary}
              disabled={stage === "applying"}
              onClick={() => void send(true)}
            >
              {stage === "applying" ? copy.applying : copy.apply}
            </button>
            <button type="button" className={styles.secondary} onClick={reset}>
              {copy.cancel}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
