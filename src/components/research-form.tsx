"use client";

import { useState } from "react";
import type { Locale } from "@/lib/domain/types";

interface ResearchResult {
  summary: string;
  sources: Array<{ title: string; url: string }>;
  provider: "mock" | "openai";
  safetyNotice: string;
}

export function ResearchForm({ locale }: { locale: Locale }) {
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: form.get("query"), locale, confirmed: true }),
    });
    if (!response.ok) {
      setStatus("error");
      return;
    }
    setResult((await response.json()) as ResearchResult);
    setStatus("idle");
  }

  return (
    <form className="stack-form" onSubmit={submit}>
      <div className="field"><label htmlFor="research-query">{locale === "es" ? "Pregunta de investigación" : "Research question"}</label><textarea id="research-query" name="query" minLength={10} maxLength={800} required /></div>
      <label className="notice"><input type="checkbox" required /> {locale === "es" ? "Confirmo que esta búsqueda fue iniciada por una persona curadora y que sus resultados serán solo sugerencias." : "I confirm this search was curator-initiated and its results will remain suggestions."}</label>
      <button className="button" type="submit" disabled={status === "loading"}>{status === "loading" ? (locale === "es" ? "Investigando…" : "Researching…") : (locale === "es" ? "Crear sugerencias" : "Create suggestions")}</button>
      {status === "error" ? <p className="form-status error" role="alert">{locale === "es" ? "La solicitud no pudo completarse." : "The request could not be completed."}</p> : null}
      {result ? <section className="chat-answer"><p className="eyebrow">{result.provider === "openai" ? "OpenAI external research" : "Mock fallback"}</p><blockquote>{result.summary}</blockquote><p className="chat-scope">{result.safetyNotice}</p>{result.sources.length ? <ol className="source-list">{result.sources.map((source) => <li key={source.url}><a href={source.url}>{source.title}</a></li>)}</ol> : null}</section> : null}
    </form>
  );
}
