"use client";

import Link from "next/link";
import { useState } from "react";
import type { Locale } from "@/lib/domain/types";
import { PaidResearchConfirmation } from "./paid-research-confirmation";
import styles from "./research-form.module.css";

interface ResearchResult {
  summary: string;
  sources: Array<{ title: string; url: string }>;
  provider: "mock" | "openai";
  safetyNotice: string;
}

export function ResearchForm({ locale }: { locale: Locale }) {
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);

  function reviewPaidRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = String(new FormData(event.currentTarget).get("query") ?? "").trim();
    if (query.length < 10 || status === "loading") return;
    setError("");
    setPendingQuery(query);
  }

  async function runConfirmedResearch() {
    const query = pendingQuery;
    if (!query || status === "loading") return;
    // Clear the one-time confirmation before the request starts. A later
    // submission must open a fresh dialog, even when the query is unchanged.
    setPendingQuery(null);
    setStatus("loading");
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/research", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          locale,
          confirmed: true,
          costAcknowledgement: "CLICKSMITH_PAYS_OPENAI_FEES",
        }),
        cache: "no-store",
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = payload && typeof payload === "object" && "error" in payload
          ? String(payload.error)
          : locale === "es"
            ? "La solicitud no pudo completarse."
            : "The request could not be completed.";
        throw new Error(message);
      }
      setResult(payload as ResearchResult);
      setStatus("idle");
    } catch (caught) {
      setStatus("error");
      setError(
        caught instanceof Error
          ? caught.message
          : locale === "es"
            ? "La solicitud no pudo completarse."
            : "The request could not be completed.",
      );
    }
  }

  return (
    <div className={styles.shell}>
      <form className="stack-form" onSubmit={reviewPaidRequest} aria-busy={status === "loading"}>
        <div className="field">
          <label htmlFor="research-query">{locale === "es" ? "Pregunta de investigación" : "Research question"}</label>
          <textarea id="research-query" name="query" minLength={10} maxLength={800} required />
        </div>

        <div className={styles.paidNotice}>
          <span aria-hidden="true">$</span>
          <div>
            <strong>{locale === "es" ? "Herramienta externa pagada" : "Paid external tool"}</strong>
            <p>
              {locale === "es"
                ? "Antes de cada búsqueda, verás exactamente quién paga, qué puede variar y qué se enviará. Nada comienza sin tu confirmación."
                : "Before every search, you’ll see exactly who pays, what can vary, and what will be sent. Nothing starts without your confirmation."}
            </p>
          </div>
        </div>

        <button className="button" type="submit" disabled={status === "loading"}>
          {status === "loading"
            ? (locale === "es" ? "Investigando…" : "Researching…")
            : (locale === "es" ? "Revisar búsqueda pagada" : "Review paid search")}
        </button>

        <p className={styles.internalNote}>
          {locale === "es" ? "¿Buscas respuestas en los archivos ya cargados? " : "Looking for answers in material already uploaded? "}
          <Link href="/demo/robin/archive#assistant">
            {locale === "es" ? "El Asistente del Archivo no usa IA pagada." : "The Archive Assistant uses no paid AI."}
          </Link>
        </p>

        {status === "error" ? <p className="form-status error" role="alert">{error}</p> : null}
        {result ? (
          <section className="chat-answer">
            <p className="eyebrow">{result.provider === "openai" ? "OpenAI external research" : "Mock fallback"}</p>
            <blockquote>{result.summary}</blockquote>
            <p className="chat-scope">{result.safetyNotice}</p>
            {result.sources.length ? <ol className="source-list">{result.sources.map((source) => <li key={source.url}><a href={source.url}>{source.title}</a></li>)}</ol> : null}
          </section>
        ) : null}
      </form>

      <PaidResearchConfirmation
        locale={locale}
        open={pendingQuery !== null}
        query={pendingQuery ?? ""}
        onCancel={() => setPendingQuery(null)}
        onContinue={() => void runConfirmedResearch()}
      />
    </div>
  );
}
