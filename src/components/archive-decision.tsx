"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale, ReviewStatus } from "@/lib/domain/types";
import styles from "./archive-decision.module.css";

interface ArchiveDecisionProps {
  itemId: string;
  reviewStatus: ReviewStatus;
  locale: Locale;
}

type Pending = "approve" | "reject" | null;

const copyFor = (locale: Locale) =>
  locale === "es"
    ? {
        legend: "Decisión curatorial",
        note: "Aprobar no publica el registro. La publicación es un paso aparte.",
        rationaleLabel: "Motivo",
        rationaleHint: "Obligatorio al devolver una carga.",
        approve: "Aprobar",
        reject: "Devolver",
        working: "Guardando…",
        failure: "No pudimos registrar la decisión.",
        decided: (status: ReviewStatus) =>
          status === "approved" ? "Aprobado en revisión." : "Devuelto al colaborador.",
        reopen: "Registrar una nueva decisión",
      }
    : {
        legend: "Curatorial decision",
        note: "Approving does not publish the record. Publication is a separate step.",
        rationaleLabel: "Reason",
        rationaleHint: "Required when returning an upload.",
        approve: "Approve",
        reject: "Return",
        working: "Saving…",
        failure: "We could not record that decision.",
        decided: (status: ReviewStatus) =>
          status === "approved" ? "Approved in review." : "Returned to the contributor.",
        reopen: "Record a new decision",
      };

export function ArchiveDecision({ itemId, reviewStatus, locale }: ArchiveDecisionProps) {
  const router = useRouter();
  const copy = copyFor(locale);
  const settled = reviewStatus === "approved" || reviewStatus === "rejected";
  const [showForm, setShowForm] = useState(!settled);
  const [rationale, setRationale] = useState("");
  const [pending, setPending] = useState<Pending>(null);
  const [errorMessage, setErrorMessage] = useState("");

  async function decide(decision: "approve" | "reject") {
    if (decision === "reject" && !rationale.trim()) {
      setErrorMessage(copy.rationaleHint);
      return;
    }
    setPending(decision);
    setErrorMessage("");
    try {
      const response = await fetch(`/api/archive/items/${itemId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, rationale: rationale.trim() || undefined }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          typeof body === "object" && body !== null && "error" in body
            ? String((body as { error: unknown }).error)
            : copy.failure;
        setPending(null);
        setErrorMessage(message);
        return;
      }
      setPending(null);
      setRationale("");
      setShowForm(false);
      router.refresh();
    } catch {
      setPending(null);
      setErrorMessage(copy.failure);
    }
  }

  if (settled && !showForm) {
    return (
      <div className={styles.settled}>
        <p className={styles.settledText}>{copy.decided(reviewStatus)}</p>
        <button type="button" className={styles.reopen} onClick={() => setShowForm(true)}>
          {copy.reopen}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <p className={styles.legend}>{copy.legend}</p>
      <p className={styles.note}>{copy.note}</p>
      <label className={styles.field} htmlFor="decision-rationale">
        {copy.rationaleLabel}
        <span className={styles.hint}>{copy.rationaleHint}</span>
      </label>
      <textarea
        id="decision-rationale"
        className={styles.textarea}
        maxLength={2000}
        rows={3}
        value={rationale}
        onChange={(event) => setRationale(event.target.value)}
      />
      {errorMessage ? (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      ) : null}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.approve}
          disabled={pending !== null}
          onClick={() => decide("approve")}
        >
          {pending === "approve" ? copy.working : copy.approve}
        </button>
        <button
          type="button"
          className={styles.reject}
          disabled={pending !== null}
          onClick={() => decide("reject")}
        >
          {pending === "reject" ? copy.working : copy.reject}
        </button>
      </div>
    </div>
  );
}
