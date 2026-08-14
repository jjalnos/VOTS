"use client";

import { useState } from "react";
import type { ChatCitation, Locale } from "@/lib/domain/types";

interface ChatResult {
  answer: string;
  citations: ChatCitation[];
  scopeNotice: string;
  provider: "mock" | "local_openai_compatible";
}

export function ChatExperience({ locale }: { locale: Locale }) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<ChatResult | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setResult(null);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, locale }),
      });
      if (!response.ok) throw new Error("Request failed");
      setResult((await response.json()) as ChatResult);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="card">
      <form className="chat-form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="archive-question">
            {locale === "es" ? "Su pregunta" : "Your question"}
          </label>
          <textarea
            id="archive-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={
              locale === "es"
                ? "Por ejemplo: ¿Cómo funciona la revisión de publicación?"
                : "For example: How does publication review work?"
            }
            minLength={2}
            maxLength={600}
            required
          />
        </div>
        <button className="button" type="submit" disabled={status === "loading"}>
          {status === "loading"
            ? locale === "es" ? "Buscando fuentes…" : "Searching sources…"
            : locale === "es" ? "Consultar el archivo" : "Ask the archive"}
        </button>
        {status === "error" ? (
          <p className="form-status error" role="alert">
            {locale === "es" ? "No se pudo completar la consulta." : "The question could not be completed."}
          </p>
        ) : null}
      </form>
      {result ? (
        <section className="chat-answer" aria-live="polite">
          <p className="eyebrow">{locale === "es" ? "Respuesta con alcance limitado" : "Scope-limited answer"}</p>
          <blockquote>{result.answer}</blockquote>
          {result.citations.length ? (
            <>
              <h3>{locale === "es" ? "Citas" : "Citations"}</h3>
              <ol className="source-list">
                {result.citations.map((citation) => (
                  <li key={citation.id}><a href={citation.href}>{citation.label}</a></li>
                ))}
              </ol>
            </>
          ) : (
            <p className="notice">{locale === "es" ? "No se encontró respaldo publicado; no se generó una afirmación." : "No published support was found, so no claim was generated."}</p>
          )}
          <p className="chat-scope">{result.scopeNotice}</p>
        </section>
      ) : null}
    </div>
  );
}
