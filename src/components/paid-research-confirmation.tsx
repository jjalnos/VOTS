"use client";

import { useEffect, useRef } from "react";
import type { Locale } from "@/lib/domain/types";
import styles from "./paid-research-confirmation.module.css";

export interface PaidResearchConfirmationCopy {
  eyebrow: string;
  title: string;
  introduction: string;
  paidTokens: string;
  payer: string;
  variableCost: string;
  noAction: string;
  sentLabel: string;
  sentBoundary: string;
  everyTime: string;
  cancel: string;
  continue: string;
}

export function paidResearchConfirmationCopy(locale: Locale): PaidResearchConfirmationCopy {
  if (locale === "es") {
    return {
      eyebrow: "Confirmación de costo obligatoria",
      title: "Antes de iniciar esta búsqueda pagada",
      introduction: "Esta es la herramienta externa de investigación de OpenAI, no el asistente interno del archivo.",
      paidTokens: "Esta búsqueda usa tokens pagados de OpenAI.",
      payer: "Clicksmith paga la tarifa.",
      variableCost: "El costo real varía según la longitud y la complejidad de la pregunta y la respuesta.",
      noAction: "No sucede nada hasta que elijas Continuar.",
      sentLabel: "Pregunta que se enviará",
      sentBoundary: "Solo se envía esta pregunta de investigación. Las cargas privadas del archivo no se envían a OpenAI.",
      everyTime: "Esta confirmación aparecerá antes de cada búsqueda pagada. No hay una opción para omitirla ni recordarla.",
      cancel: "Cancelar",
      continue: "Continuar y usar OpenAI pagado",
    };
  }
  return {
    eyebrow: "Required cost confirmation",
    title: "Before this paid search runs",
    introduction: "This is the external OpenAI research tool, not the internal Archive Assistant.",
    paidTokens: "This search uses paid OpenAI tokens.",
    payer: "Clicksmith pays the fee.",
    variableCost: "The actual cost varies with the length and complexity of the question and response.",
    noAction: "Nothing happens until you choose Continue.",
    sentLabel: "Question that will be sent",
    sentBoundary: "Only this research question is sent. Private archive uploads are not sent to OpenAI.",
    everyTime: "This confirmation appears before every paid search. There is no remember or skip option.",
    cancel: "Cancel",
    continue: "Continue and use paid OpenAI",
  };
}

export function PaidResearchConfirmation({
  locale,
  open,
  query,
  onCancel,
  onContinue,
}: {
  locale: Locale;
  open: boolean;
  query: string;
  onCancel: () => void;
  onContinue: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const copy = paidResearchConfirmationCopy(locale);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="paid-research-confirmation-title"
      aria-describedby="paid-research-confirmation-summary"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <div className={styles.topbar}>
        <span aria-hidden="true">$</span>
        <p>{copy.eyebrow}</p>
      </div>
      <div className={styles.body}>
        <p className={styles.kicker}>OpenAI · External research</p>
        <h2 id="paid-research-confirmation-title">{copy.title}</h2>
        <p id="paid-research-confirmation-summary" className={styles.introduction}>
          {copy.introduction}
        </p>

        <ul className={styles.costFacts}>
          <li><span aria-hidden="true">01</span><strong>{copy.paidTokens}</strong></li>
          <li><span aria-hidden="true">02</span><strong>{copy.payer}</strong></li>
          <li><span aria-hidden="true">03</span><strong>{copy.variableCost}</strong></li>
          <li><span aria-hidden="true">04</span><strong>{copy.noAction}</strong></li>
        </ul>

        <div className={styles.queryPreview}>
          <span>{copy.sentLabel}</span>
          <blockquote>{query}</blockquote>
          <p>{copy.sentBoundary}</p>
        </div>

        <p className={styles.everyTime}><span aria-hidden="true">↻</span>{copy.everyTime}</p>
      </div>
      <footer className={styles.actions}>
        <button ref={cancelRef} type="button" onClick={onCancel}>{copy.cancel}</button>
        <button type="button" onClick={onContinue}>{copy.continue}<span aria-hidden="true">→</span></button>
      </footer>
    </dialog>
  );
}
