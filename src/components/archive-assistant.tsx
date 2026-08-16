"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  askDemoArchiveAssistant,
  DemoArchiveAssistantError,
  type DemoArchiveAssistantAnswer,
  type DemoArchiveAssistantHistoryMessage,
} from "@/lib/demo-archive-assistant-client";
import styles from "./archive-assistant.module.css";

interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  result?: DemoArchiveAssistantAnswer;
  errorStatus?: number;
}

const STARTERS = [
  "What do these records say about Stephan Jalnos’s family?",
  "Which Sam Cohen records could support a book chapter?",
  "What information is still missing from this private archive?",
] as const;

const WELCOME: ConversationMessage = {
  id: "archive-assistant-welcome",
  role: "assistant",
  content:
    "Ask me about the private records Robin has stored here. I’ll answer from archive metadata and searchable text, cite the exact records I used, and say when the collection does not establish an answer.",
};

function conversationHistory(messages: ConversationMessage[]): DemoArchiveAssistantHistoryMessage[] {
  return messages
    .filter((message) => message.id !== WELCOME.id && !message.errorStatus)
    .map((message) => ({ role: message.role, content: message.content }))
    .slice(-8);
}

function sourceLabel(result: DemoArchiveAssistantAnswer): string {
  if (result.provider === "self-hosted-local") return "Self-hosted archive model";
  if (result.aiUsage.status === "fallback") return "Grounded archive fallback";
  return "Grounded archive search";
}

export function ArchiveAssistant() {
  const [messages, setMessages] = useState<ConversationMessage[]>([WELCOME]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"idle" | "thinking">("idle");
  const abortRef = useRef<AbortController | null>(null);
  const conversationRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const conversation = conversationRef.current;
    if (conversation) conversation.scrollTop = conversation.scrollHeight;
  }, [messages, status]);

  async function ask(questionInput: string) {
    const question = questionInput.trim();
    if (!question || status === "thinking") return;
    const history = conversationHistory(messages);
    const userMessage: ConversationMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
    };
    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setStatus("thinking");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await askDemoArchiveAssistant(question, history, controller.signal);
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.answer,
        result,
      }]);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          error instanceof Error
            ? error.message
            : "The Archive Assistant could not open the private collection.",
        errorStatus: error instanceof DemoArchiveAssistantError ? error.status : 503,
      }]);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setStatus("idle");
    }
  }

  const hasConversation = messages.some((message) => message.role === "user");

  return (
    <section className={styles.section} id="assistant" aria-labelledby="archive-assistant-heading">
      <header className={styles.heading}>
        <div>
          <p>03 / Ask the collection</p>
          <h2 id="archive-assistant-heading">A research room that answers back.</h2>
        </div>
        <span>
          A private, citation-first assistant for Robin’s archive—grounded in what she has
          uploaded, honest about what is missing, and isolated from external AI by default.
        </span>
      </header>

      <div className={styles.window}>
        <aside className={styles.contextRail}>
          <div className={styles.agentMark} aria-hidden="true">A</div>
          <p>Archive Assistant</p>
          <h3>Robin’s private research partner</h3>
          <ul>
            <li><span aria-hidden="true">01</span><strong>Reads only this authenticated workspace</strong></li>
            <li><span aria-hidden="true">02</span><strong>Cites each private record by title and ID</strong></li>
            <li><span aria-hidden="true">03</span><strong>Says “I don’t know” when evidence is absent</strong></li>
          </ul>
          <div className={styles.costBoundary}>
            <span aria-hidden="true">✓</span>
            <div>
              <strong>No OpenAI or Codex credits</strong>
              <p>Internal questions use archive search or a configured self-hosted model. Internet research is a separate, explicit action.</p>
            </div>
          </div>
          <div className={styles.scopeNote}>
            <strong>Private means private</strong>
            <span>Original files are never sent to the assistant. It receives catalog metadata and extracted text only.</span>
          </div>
        </aside>

        <div className={styles.chatPanel}>
          <header className={styles.chatTopbar}>
            <div>
              <i aria-hidden="true" />
              <span><strong>Archive-only conversation</strong><small>Authenticated · citation required</small></span>
            </div>
            {hasConversation ? (
              <button
                type="button"
                onClick={() => {
                  abortRef.current?.abort();
                  setMessages([WELCOME]);
                  setDraft("");
                  setStatus("idle");
                }}
              >
                New conversation
              </button>
            ) : null}
          </header>

          <div className={styles.conversation} ref={conversationRef} aria-live="polite">
            {messages.map((message) => (
              <article
                key={message.id}
                className={styles.message}
                data-role={message.role}
                data-confidence={message.result?.confidence}
              >
                <div className={styles.messageLabel}>
                  <span>{message.role === "assistant" ? "Archive Assistant" : "Robin"}</span>
                  {message.result ? <small>{sourceLabel(message.result)}</small> : null}
                </div>
                <div className={styles.bubble}>
                  <p>{message.content}</p>
                  {message.errorStatus === 401 ? (
                    <Link href="/login?returnTo=/demo/robin/archive">Sign in and return to the archive</Link>
                  ) : null}
                  {message.result?.citations.length ? (
                    <ol className={styles.citations} aria-label="Private archive citations">
                      {message.result.citations.map((citation) => (
                        <li key={`${message.id}-${citation.recordId}-${citation.index}`}>
                          <a href="#library">
                            <span>[{citation.index}]</span>
                            <div>
                              <strong>{citation.title}</strong>
                              <small>{citation.survivorName} · {citation.locator} · {citation.recordId}</small>
                              <p>{citation.excerpt}</p>
                            </div>
                          </a>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                  {message.result ? (
                    <footer>
                      <span>{message.result.archiveScope.recordsSearched} private record{message.result.archiveScope.recordsSearched === 1 ? "" : "s"} searched</span>
                      <span>External provider called: no</span>
                    </footer>
                  ) : null}
                </div>
              </article>
            ))}

            {status === "thinking" ? (
              <div className={styles.thinking} role="status">
                <span>Searching Robin’s private evidence</span><i /><i /><i />
              </div>
            ) : null}
          </div>

          {!hasConversation ? (
            <div className={styles.starters} aria-label="Suggested archive questions">
              {STARTERS.map((starter) => (
                <button key={starter} type="button" onClick={() => void ask(starter)}>{starter}</button>
              ))}
            </div>
          ) : null}

          <form
            className={styles.composer}
            onSubmit={(event) => {
              event.preventDefault();
              void ask(draft);
            }}
          >
            <label htmlFor="archive-assistant-question">Ask Robin’s private archive</label>
            <div>
              <textarea
                id="archive-assistant-question"
                rows={2}
                maxLength={1200}
                value={draft}
                disabled={status === "thinking"}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void ask(draft);
                  }
                }}
                placeholder="Ask about a person, date, source, relationship, place, or gap in the record…"
              />
              <button type="submit" disabled={!draft.trim() || status === "thinking"}>
                {status === "thinking" ? "Reading…" : "Ask archive"}
                <span aria-hidden="true">→</span>
              </button>
            </div>
            <p><span aria-hidden="true">◆</span> Answers are working research notes, not publication-ready historical claims.</p>
          </form>
        </div>
      </div>
    </section>
  );
}
