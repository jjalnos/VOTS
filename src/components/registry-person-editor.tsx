"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import type { Locale } from "@/lib/domain/types";
import {
  REGISTRY_GENERATIONS,
  type RegistryGeneration,
  type RegistryPerson,
} from "@/lib/survivor-registry/types";
import styles from "./registry-person-editor.module.css";

interface EditorCopy {
  addTitle: string;
  editTitle: (name: string) => string;
  firstName: string;
  lastName: string;
  title: string;
  generation: string;
  familyThread: string;
  familyThreadHint: string;
  origin: string;
  dateOfBirth: string;
  dateOfDeath: string;
  camps: string;
  campsHint: string;
  deceased: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  notes: string;
  notesHint: string;
  save: string;
  saving: string;
  saved: string;
  cancel: string;
  requiredError: string;
  failure: string;
}

const GENERATION_LABELS: Record<RegistryGeneration, Record<Locale, string>> = {
  survivor: { en: "Survivor", es: "Sobreviviente" },
  "survivor-spouse": { en: "Survivor's spouse", es: "Cónyuge de sobreviviente" },
  "2nd-gen": { en: "2nd generation", es: "2.ª generación" },
  "2nd-gen-spouse": { en: "2nd gen spouse", es: "Cónyuge 2.ª gen" },
  "3rd-gen": { en: "3rd generation", es: "3.ª generación" },
  "3rd-gen-spouse": { en: "3rd gen spouse", es: "Cónyuge 3.ª gen" },
  "4th-gen": { en: "4th generation", es: "4.ª generación" },
  "4th-gen-spouse": { en: "4th gen spouse", es: "Cónyuge 4.ª gen" },
  indirect: { en: "Indirect", es: "Indirecto" },
  "indirect-spouse": { en: "Indirect spouse", es: "Cónyuge indirecto" },
  contact: { en: "Contact", es: "Contacto" },
  unclassified: { en: "Unclassified", es: "Sin clasificar" },
};

function copyFor(locale: Locale): EditorCopy {
  if (locale === "es") {
    return {
      addTitle: "Añadir una persona al registro",
      editTitle: (name) => `Editar: ${name}`,
      firstName: "Nombre",
      lastName: "Apellido",
      title: "Título",
      generation: "Generación",
      familyThread: "Referencia familiar",
      familyThreadHint: "Como lo anota Robin: “Miriam and Yakob Szanto”.",
      origin: "País de origen",
      dateOfBirth: "Fecha de nacimiento",
      dateOfDeath: "Fecha de fallecimiento",
      camps: "Campos / destino",
      campsHint: "Separe con comas: Auschwitz, Bergen-Belsen, se ocultó…",
      deceased: "Fallecida/o — se muestra ז״ל junto al nombre",
      email: "Correo",
      phone: "Teléfono",
      city: "Ciudad",
      state: "Estado",
      notes: "Notas del registro",
      notesHint: "Contexto privado para curaduría; nunca se publica.",
      save: "Guardar en el registro",
      saving: "Guardando…",
      saved: "Guardado.",
      cancel: "Cerrar",
      requiredError: "Se necesita al menos un nombre o un apellido.",
      failure: "No se pudo guardar. Revise la conexión e intente de nuevo.",
    };
  }
  return {
    addTitle: "Add a person to the register",
    editTitle: (name) => `Edit: ${name}`,
    firstName: "First name",
    lastName: "Last name",
    title: "Title",
    generation: "Generation",
    familyThread: "Family reference",
    familyThreadHint: "As Robin records it: “Miriam and Yakob Szanto”.",
    origin: "Country of origin",
    dateOfBirth: "Date of birth",
    dateOfDeath: "Date of death",
    camps: "Camps / fate",
    campsHint: "Comma-separated: Auschwitz, Bergen-Belsen, hid…",
    deceased: "Deceased — shows ז״ל beside the name",
    email: "Email",
    phone: "Phone",
    city: "City",
    state: "State",
    notes: "Register notes",
    notesHint: "Private curatorial context; never published.",
    save: "Save to the register",
    saving: "Saving…",
    saved: "Saved.",
    cancel: "Close",
    requiredError: "At least a first or last name is needed.",
    failure: "The save did not go through. Check the connection and try again.",
  };
}

export function RegistryPersonEditor({
  locale,
  person,
  closeHref,
}: {
  locale: Locale;
  person?: RegistryPerson;
  closeHref: string;
}) {
  const router = useRouter();
  const copy = copyFor(locale);
  const formId = useId();
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = (key: string) => String(data.get(key) ?? "").trim();
    if (!text("firstName") && !text("lastName")) {
      setStatus("error");
      setErrorMessage(copy.requiredError);
      return;
    }
    const payload = {
      ...(person ? { id: person.id } : {}),
      firstName: text("firstName"),
      lastName: text("lastName"),
      title: text("title"),
      generation: text("generation"),
      familyThread: text("familyThread"),
      countryOfOrigin: text("countryOfOrigin"),
      dateOfBirth: text("dateOfBirth"),
      dateOfDeath: text("dateOfDeath"),
      camps: text("camps")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
      fateNotes: person?.fateNotes ?? [],
      address: person?.address ?? "",
      city: text("city"),
      state: text("state"),
      zip: person?.zip ?? "",
      email: text("email"),
      phone: text("phone"),
      deceased: data.get("deceased") === "on",
      notes: text("notes"),
    };
    setStatus("saving");
    setErrorMessage("");
    try {
      const response = await fetch("/api/curator/registry", {
        method: person ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          typeof body === "object" && body !== null && "error" in body
            ? String((body as { error: unknown }).error)
            : copy.failure;
        setStatus("error");
        setErrorMessage(message);
        return;
      }
      setStatus("saved");
      router.push(closeHref);
      router.refresh();
    } catch {
      setStatus("error");
      setErrorMessage(copy.failure);
    }
  }

  const heading = person
    ? copy.editTitle(`${person.firstName} ${person.lastName}`.trim())
    : copy.addTitle;

  return (
    <form className={styles.editor} onSubmit={handleSubmit} aria-labelledby={`${formId}-title`}>
      <div className={styles.header}>
        <h3 id={`${formId}-title`}>{heading}</h3>
        <a className={styles.cancel} href={closeHref}>
          {copy.cancel}
        </a>
      </div>

      <div className={styles.grid}>
        <div className={styles.field}>
          <label htmlFor={`${formId}-first`}>{copy.firstName}</label>
          <input id={`${formId}-first`} name="firstName" defaultValue={person?.firstName ?? ""} autoComplete="off" />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${formId}-last`}>{copy.lastName}</label>
          <input id={`${formId}-last`} name="lastName" defaultValue={person?.lastName ?? ""} autoComplete="off" />
        </div>
        <div className={styles.fieldSmall}>
          <label htmlFor={`${formId}-titlefield`}>{copy.title}</label>
          <input id={`${formId}-titlefield`} name="title" defaultValue={person?.title ?? ""} autoComplete="off" />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${formId}-generation`}>{copy.generation}</label>
          <select id={`${formId}-generation`} name="generation" defaultValue={person?.generation ?? "survivor"}>
            {REGISTRY_GENERATIONS.map((generation) => (
              <option key={generation} value={generation}>
                {GENERATION_LABELS[generation][locale]}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.fieldWide}>
          <label htmlFor={`${formId}-family`}>{copy.familyThread}</label>
          <input id={`${formId}-family`} name="familyThread" defaultValue={person?.familyThread ?? ""} autoComplete="off" />
          <p className={styles.hint}>{copy.familyThreadHint}</p>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${formId}-origin`}>{copy.origin}</label>
          <input id={`${formId}-origin`} name="countryOfOrigin" defaultValue={person?.countryOfOrigin ?? ""} autoComplete="off" />
        </div>
        <div className={styles.fieldSmall}>
          <label htmlFor={`${formId}-dob`}>{copy.dateOfBirth}</label>
          <input id={`${formId}-dob`} name="dateOfBirth" defaultValue={person?.dateOfBirth ?? ""} autoComplete="off" />
        </div>
        <div className={styles.fieldSmall}>
          <label htmlFor={`${formId}-dod`}>{copy.dateOfDeath}</label>
          <input id={`${formId}-dod`} name="dateOfDeath" defaultValue={person?.dateOfDeath ?? ""} autoComplete="off" />
        </div>
        <div className={styles.fieldWide}>
          <label htmlFor={`${formId}-camps`}>{copy.camps}</label>
          <input
            id={`${formId}-camps`}
            name="camps"
            defaultValue={person ? [...person.camps, ...person.fateNotes].join(", ") : ""}
            autoComplete="off"
          />
          <p className={styles.hint}>{copy.campsHint}</p>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${formId}-email`}>{copy.email}</label>
          <input id={`${formId}-email`} name="email" type="email" defaultValue={person?.email ?? ""} autoComplete="off" />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${formId}-phone`}>{copy.phone}</label>
          <input id={`${formId}-phone`} name="phone" defaultValue={person?.phone ?? ""} autoComplete="off" />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${formId}-city`}>{copy.city}</label>
          <input id={`${formId}-city`} name="city" defaultValue={person?.city ?? ""} autoComplete="off" />
        </div>
        <div className={styles.fieldSmall}>
          <label htmlFor={`${formId}-state`}>{copy.state}</label>
          <input id={`${formId}-state`} name="state" defaultValue={person?.state ?? ""} autoComplete="off" />
        </div>
        <div className={styles.fieldWide}>
          <label htmlFor={`${formId}-notes`}>{copy.notes}</label>
          <textarea id={`${formId}-notes`} name="notes" rows={3} defaultValue={person?.notes ?? ""} />
          <p className={styles.hint}>{copy.notesHint}</p>
        </div>
        <div className={styles.fieldWide}>
          <label className={styles.deceased}>
            <input type="checkbox" name="deceased" defaultChecked={person?.deceased ?? false} />
            <span>{copy.deceased}</span>
          </label>
        </div>
      </div>

      <div className={styles.footer}>
        <button type="submit" className={styles.save} disabled={status === "saving"}>
          {status === "saving" ? copy.saving : copy.save}
        </button>
        <p role="status" className={status === "error" ? styles.error : styles.status}>
          {status === "error" ? errorMessage : status === "saved" ? copy.saved : ""}
        </p>
      </div>
    </form>
  );
}
