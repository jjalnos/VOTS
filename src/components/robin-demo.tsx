"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ROBIN_DEMO_RESEARCH_CLAIMS,
  ROBIN_DEMO_UPLOADS,
  type RobinClaimPerson,
  type RobinDemoResearchClaim,
  type RobinDemoUpload,
  type RobinDemoUploadStatus,
  type RobinDemoUploadType,
} from "@/lib/data/robin-demo";
import styles from "./robin-demo.module.css";

const PAGE_SIZE = 6;
const DECISION_STORAGE_KEY = "vots-robin-demo-claim-decisions-v1";

type ChatRole = "user" | "assistant";
type AgentMode = "archive-only" | "local-model";

interface AgentCitation {
  label: string;
  href: string;
}

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  citations?: AgentCitation[];
  mode?: AgentMode;
}

interface AgentResponse {
  answer: string;
  citations: AgentCitation[];
  mode: AgentMode;
  suggestions: string[];
}

type ClaimDecisionStatus = "approved" | "rejected" | "changes-requested";

interface ClaimDecision {
  status: ClaimDecisionStatus;
  note?: string;
  updatedAt: string;
}

interface PendingAgentRequest {
  message: string;
  history: Array<{ role: ChatRole; content: string }>;
  focusPerson?: string;
}

interface DemoResearchSource {
  id: string;
  survivorName: RobinClaimPerson;
  title: string;
  url: string;
  publisher: string;
}

interface DemoResearchCatalog {
  survivors: RobinClaimPerson[];
  sources: DemoResearchSource[];
  allowedDomains: string[];
  mode: "deterministic-no-credits";
}

interface DemoResearchRunClaim {
  id: string;
  subject: RobinClaimPerson;
  field: string;
  value: string;
  evidenceNote: string;
  sourceTitle: string;
  sourceUrl: string;
  status: "suggested";
}

interface DemoResearchRunResult {
  survivorName: RobinClaimPerson;
  status: "suggested";
  requiresCuratorApproval: true;
  source: {
    title: string;
    url: string;
    publisher?: string;
    retrieval: "fetched" | "metadata-only";
    contentType?: string;
  };
  claims: DemoResearchRunClaim[];
  evidenceNote: string;
  limitations: string[];
  safetyNotice: string;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content:
      "Good afternoon, Robin. I can search this private demo workspace, separate approved evidence from open questions, and keep every answer tied to its source.",
    mode: "archive-only",
  },
  {
    id: "seed-question",
    role: "user",
    content: "What can I safely say about Stephan Jalnos right now?",
  },
  {
    id: "seed-answer",
    role: "assistant",
    content:
      "The source-backed material in this demo supports a careful statement that HMMSA traces Stephan Jalnos’s story from the Łódź Ghetto through resistance activity and Mauthausen. It does not establish his birth details, parents, or a prewar family occupation, so I would leave those fields open.",
    citations: [
      {
        label: "HMMSA — Survivor Speakers Series: Stephan Jalnos",
        href:
          "https://www.hmmsa.org/all-events/survivor-speakers-series-the-stories-of-holocaust-survivors-told-by-their-descendants",
      },
    ],
    mode: "archive-only",
  },
];

const INITIAL_SUGGESTIONS = [
  "What is documented about Sam Cohen’s escape?",
  "Which Stephan Jalnos details are still unsupported?",
  "Show me what needs Robin’s review today.",
];

const uploadTypes: Array<RobinDemoUploadType | "All types"> = [
  "All types",
  "Audio",
  "Document",
  "Photograph",
  "Video",
];

const uploadStatuses: Array<RobinDemoUploadStatus | "All statuses"> = [
  "All statuses",
  "Needs review",
  "In transcription",
  "Ready for review",
  "Approved for private use",
];

function isAgentResponse(value: unknown): value is AgentResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AgentResponse>;
  return (
    typeof candidate.answer === "string" &&
    Array.isArray(candidate.citations) &&
    candidate.citations.every(
      (citation) =>
        citation &&
        typeof citation === "object" &&
        typeof citation.label === "string" &&
        typeof citation.href === "string",
    ) &&
    (candidate.mode === "archive-only" || candidate.mode === "local-model") &&
    Array.isArray(candidate.suggestions) &&
    candidate.suggestions.every((suggestion) => typeof suggestion === "string")
  );
}

function isResearchPerson(value: unknown): value is RobinClaimPerson {
  return value === "Sam Cohen" || value === "Stephan Jalnos";
}

function isResearchCatalog(value: unknown): value is DemoResearchCatalog {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DemoResearchCatalog>;
  return (
    Array.isArray(candidate.survivors) &&
    candidate.survivors.every(isResearchPerson) &&
    Array.isArray(candidate.sources) &&
    candidate.sources.every(
      (source) =>
        source &&
        typeof source === "object" &&
        typeof source.id === "string" &&
        isResearchPerson(source.survivorName) &&
        typeof source.title === "string" &&
        typeof source.url === "string" &&
        typeof source.publisher === "string",
    ) &&
    Array.isArray(candidate.allowedDomains) &&
    candidate.allowedDomains.every((domain) => typeof domain === "string") &&
    candidate.mode === "deterministic-no-credits"
  );
}

function isResearchRunResult(value: unknown): value is DemoResearchRunResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DemoResearchRunResult>;
  const source = candidate.source;
  return (
    isResearchPerson(candidate.survivorName) &&
    candidate.status === "suggested" &&
    candidate.requiresCuratorApproval === true &&
    Boolean(source) &&
    typeof source?.title === "string" &&
    typeof source.url === "string" &&
    (source.retrieval === "fetched" || source.retrieval === "metadata-only") &&
    Array.isArray(candidate.claims) &&
    candidate.claims.every(
      (claim) =>
        claim &&
        typeof claim === "object" &&
        typeof claim.id === "string" &&
        isResearchPerson(claim.subject) &&
        typeof claim.field === "string" &&
        typeof claim.value === "string" &&
        typeof claim.evidenceNote === "string" &&
        typeof claim.sourceTitle === "string" &&
        typeof claim.sourceUrl === "string" &&
        claim.status === "suggested",
    ) &&
    typeof candidate.evidenceNote === "string" &&
    Array.isArray(candidate.limitations) &&
    candidate.limitations.every((limitation) => typeof limitation === "string") &&
    typeof candidate.safetyNotice === "string"
  );
}

function researchErrorMessage(value: unknown) {
  if (!value || typeof value !== "object") return "The research run could not be completed.";
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" && error.trim() ? error : "The research run could not be completed.";
}

function formatUploadDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function makeMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function typeMonogram(type: RobinDemoUploadType) {
  switch (type) {
    case "Audio":
      return "AU";
    case "Document":
      return "TX";
    case "Photograph":
      return "IM";
    case "Video":
      return "MV";
  }
}

function decisionLabel(status: ClaimDecisionStatus) {
  switch (status) {
    case "approved":
      return "Approved for private use";
    case "rejected":
      return "Rejected";
    case "changes-requested":
      return "Changes requested";
  }
}

function AgentDesk() {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [focusPerson, setFocusPerson] = useState<RobinClaimPerson | undefined>();
  const [suggestions, setSuggestions] = useState(INITIAL_SUGGESTIONS);
  const [mode, setMode] = useState<AgentMode>("archive-only");
  const [requestStatus, setRequestStatus] = useState<"idle" | "loading" | "error">("idle");
  const [lastRequest, setLastRequest] = useState<PendingAgentRequest | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [messages, requestStatus]);

  async function runAgentRequest(request: PendingAgentRequest) {
    setRequestStatus("loading");
    setLastRequest(request);

    try {
      const response = await fetch("/api/demo/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      if (!response.ok) throw new Error("The private assistant did not respond.");
      const payload: unknown = await response.json();
      if (!isAgentResponse(payload)) throw new Error("The assistant returned an unexpected response.");

      setMessages((current) => [
        ...current,
        {
          id: makeMessageId("assistant"),
          role: "assistant",
          content: payload.answer,
          citations: payload.citations,
          mode: payload.mode,
        },
      ]);
      setSuggestions(payload.suggestions.slice(0, 4));
      setMode(payload.mode);
      setRequestStatus("idle");
      setLastRequest(null);
    } catch {
      setRequestStatus("error");
    }
  }

  function sendPrompt(prompt: string) {
    const message = prompt.trim();
    if (!message || requestStatus === "loading") return;

    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((current) => [
      ...current,
      { id: makeMessageId("user"), role: "user", content: message },
    ]);
    setInput("");
    void runAgentRequest({ message, history, focusPerson });
  }

  function submitMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendPrompt(input);
  }

  return (
    <section className={styles.agentDesk} id="ask-robin" aria-labelledby="agent-heading">
      <header className={styles.agentHeader}>
        <div>
          <p className={styles.agentKicker}>Private Archive Assistant</p>
          <h2 id="agent-heading">Ask the private record.</h2>
        </div>
        <span className={styles.modeBadge} data-mode={mode}>
          {mode === "archive-only" ? "Archive evidence only" : "Local model · cited context"}
        </span>
      </header>

      <div className={styles.focusRow} aria-label="Limit assistant focus">
        <span>Focus</span>
        <button
          type="button"
          aria-pressed={!focusPerson}
          onClick={() => setFocusPerson(undefined)}
        >
          All records
        </button>
        <button
          type="button"
          aria-pressed={focusPerson === "Sam Cohen"}
          onClick={() => setFocusPerson("Sam Cohen")}
        >
          Sam Cohen
        </button>
        <button
          type="button"
          aria-pressed={focusPerson === "Stephan Jalnos"}
          onClick={() => setFocusPerson("Stephan Jalnos")}
        >
          Stephan Jalnos
        </button>
      </div>

      <div
        ref={transcriptRef}
        className={styles.transcript}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {messages.map((message) => (
          <article className={styles.message} data-role={message.role} key={message.id}>
          <p className={styles.messageByline}>{message.role === "assistant" ? "Archive Assistant" : "You"}</p>
            <p>{message.content}</p>
            {message.citations?.length ? (
              <div className={styles.messageSources}>
                <p>Sources used</p>
                <ol>
                  {message.citations.map((citation, index) => (
                    <li key={`${citation.href}-${index}`}>
                      <a href={citation.href} target="_blank" rel="noreferrer">
                        {citation.label}
                        <span aria-hidden="true"> ↗</span>
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </article>
        ))}

        {requestStatus === "loading" ? (
          <div className={styles.thinking} role="status">
            <span aria-hidden="true">Reading</span>
            <span className={styles.thinkingDots} aria-hidden="true">···</span>
            <span className={styles.srOnly}>The Archive Assistant is checking the private archive and its sources.</span>
          </div>
        ) : null}
      </div>

      <div className={styles.promptShelf} aria-label="Suggested questions">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => sendPrompt(suggestion)}
            disabled={requestStatus === "loading"}
          >
            {suggestion}
          </button>
        ))}
      </div>

      {requestStatus === "error" ? (
        <div className={styles.agentError} role="alert">
          <div>
            <strong>The private assistant is momentarily unavailable.</strong>
            <span>Your message is still here. Nothing was saved or approved.</span>
          </div>
          <button
            type="button"
            onClick={() => lastRequest && void runAgentRequest(lastRequest)}
            disabled={!lastRequest}
          >
            Try again
          </button>
        </div>
      ) : null}

      <form className={styles.composer} onSubmit={submitMessage}>
        <label htmlFor="robin-agent-message">Message the Archive Assistant</label>
        <div className={styles.composerRow}>
          <textarea
            id="robin-agent-message"
            rows={2}
            minLength={2}
            maxLength={600}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendPrompt(input);
              }
            }}
            placeholder="Ask about evidence, a person, or today’s review work…"
            disabled={requestStatus === "loading"}
            required
          />
          <button
            className={styles.voiceButton}
            type="button"
            disabled
            aria-label="Voice input — coming soon"
            title="Voice input — coming soon"
          >
            <span aria-hidden="true">🎙</span>
            <span>Voice</span>
            <small>Coming soon</small>
          </button>
          <button
            className={styles.sendButton}
            type="submit"
            disabled={requestStatus === "loading" || input.trim().length < 2}
          >
            {requestStatus === "loading" ? "Checking…" : "Send"}
          </button>
        </div>
        <p className={styles.composerNotice}>
          Private workspace answers may cite approved archive evidence. Robin remains the reviewer.
        </p>
      </form>
    </section>
  );
}

function UploadLibrary() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState<RobinDemoUploadType | "All types">("All types");
  const [status, setStatus] = useState<RobinDemoUploadStatus | "All statuses">("All statuses");
  const [page, setPage] = useState(1);
  const [selectedUpload, setSelectedUpload] = useState<RobinDemoUpload | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const filteredUploads = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return ROBIN_DEMO_UPLOADS.filter((upload) => {
      const searchableText = [
        upload.id,
        upload.title,
        upload.person,
        upload.type,
        upload.status,
        upload.description,
        ...upload.tags,
      ]
        .join(" ")
        .toLocaleLowerCase();
      return (
        (!normalizedSearch || searchableText.includes(normalizedSearch)) &&
        (type === "All types" || upload.type === type) &&
        (status === "All statuses" || upload.status === status)
      );
    });
  }, [search, status, type]);

  const pageCount = Math.max(1, Math.ceil(filteredUploads.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageUploads = filteredUploads.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (selectedUpload && !dialog.open) dialog.showModal();
    if (!selectedUpload && dialog.open) dialog.close();
  }, [selectedUpload]);

  function clearFilters() {
    setSearch("");
    setType("All types");
    setStatus("All statuses");
    setPage(1);
  }

  return (
    <section className={styles.librarySection} id="uploads" aria-labelledby="uploads-heading">
      <div className={styles.sectionLead}>
        <p className={styles.chapter}>02 / Private uploads</p>
        <div>
          <h2 id="uploads-heading">The worktable, not the warehouse.</h2>
          <p>
            Twenty-three synthetic records make pagination, filtering, and detail review tangible
            without exposing a real accession or original file.
          </p>
        </div>
      </div>

      <div className={styles.libraryControls}>
        <div className={styles.searchField}>
          <label htmlFor="demo-upload-search">Search this demo library</label>
          <input
            id="demo-upload-search"
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Title, person, tag, or demo ID"
          />
        </div>
        <div className={styles.filterField}>
          <label htmlFor="demo-upload-type">Type</label>
          <select
            id="demo-upload-type"
            value={type}
            onChange={(event) => {
              setType(event.target.value as RobinDemoUploadType | "All types");
              setPage(1);
            }}
          >
            {uploadTypes.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </div>
        <div className={styles.filterField}>
          <label htmlFor="demo-upload-status">Status</label>
          <select
            id="demo-upload-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as RobinDemoUploadStatus | "All statuses");
              setPage(1);
            }}
          >
            {uploadStatuses.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.resultSummary} aria-live="polite">
        <p>
          <strong>{filteredUploads.length}</strong> of {ROBIN_DEMO_UPLOADS.length} synthetic items
        </p>
        <p>
          Page {safePage} of {pageCount}
        </p>
      </div>

      {pageUploads.length ? (
        <ul className={styles.archiveGrid}>
          {pageUploads.map((upload, index) => (
            <li key={upload.id}>
              <button
                className={styles.archiveRecord}
                type="button"
                onClick={() => setSelectedUpload(upload)}
                aria-label={`Open synthetic demo record: ${upload.title}`}
              >
                <span
                  className={styles.recordPreview}
                  data-type={upload.type.toLocaleLowerCase()}
                  aria-hidden="true"
                >
                  <span>{typeMonogram(upload.type)}</span>
                  <small>synthetic</small>
                  <i>{String((safePage - 1) * PAGE_SIZE + index + 1).padStart(2, "0")}</i>
                </span>
                <span className={styles.recordBody}>
                  <span className={styles.recordOverline}>
                    <span>Synthetic demo record</span>
                    <span>{upload.id}</span>
                  </span>
                  <strong>{upload.title}</strong>
                  <span className={styles.recordPerson}>{upload.person}</span>
                  <span className={styles.recordMeta}>
                    {upload.type} · {upload.extent} · added {formatUploadDate(upload.uploadedAt)}
                  </span>
                  <span className={styles.recordFooter}>
                    <span className={styles.recordStatus} data-status={upload.status}>
                      {upload.status}
                    </span>
                    <span>Open record <span aria-hidden="true">→</span></span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.emptyLibrary}>
          <p>No synthetic records match those filters.</p>
          <button type="button" onClick={clearFilters}>Clear filters</button>
        </div>
      )}

      <nav className={styles.pagination} aria-label="Upload library pages">
        <button
          type="button"
          onClick={() => setPage((current) => Math.max(1, current - 1))}
          disabled={safePage === 1}
        >
          <span aria-hidden="true">←</span> Previous
        </button>
        <span>
          {filteredUploads.length
            ? `${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(safePage * PAGE_SIZE, filteredUploads.length)}`
            : "0"}{" "}
          of {filteredUploads.length}
        </span>
        <button
          type="button"
          onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
          disabled={safePage === pageCount}
        >
          Next <span aria-hidden="true">→</span>
        </button>
      </nav>

      <dialog
        ref={dialogRef}
        className={styles.recordDialog}
        aria-labelledby="record-dialog-title"
        onClose={() => setSelectedUpload(null)}
        onCancel={() => setSelectedUpload(null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setSelectedUpload(null);
        }}
      >
        {selectedUpload ? (
          <div className={styles.dialogInner}>
            <header className={styles.dialogHeader}>
              <div>
                <p>Synthetic demo item · {selectedUpload.id}</p>
                <h3 id="record-dialog-title">{selectedUpload.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUpload(null)}
                aria-label="Close record details"
              >
                <span aria-hidden="true">×</span>
              </button>
            </header>

            <div className={styles.dialogArtifact} data-type={selectedUpload.type.toLocaleLowerCase()}>
              <span aria-hidden="true">{typeMonogram(selectedUpload.type)}</span>
              <div>
                <strong>No original media in this prototype</strong>
                <p>This field deliberately contains an abstract placeholder.</p>
              </div>
            </div>

            <div className={styles.dialogColumns}>
              <div>
                <p className={styles.dialogLabel}>Description</p>
                <p>{selectedUpload.description}</p>
                <p className={styles.dialogLabel}>Provenance note</p>
                <p>{selectedUpload.provenance}</p>
                <p className={styles.dialogLabel}>Rights</p>
                <p>{selectedUpload.rights}</p>
              </div>
              <dl>
                <div>
                  <dt>Person</dt>
                  <dd>{selectedUpload.person}</dd>
                </div>
                <div>
                  <dt>Workflow status</dt>
                  <dd>{selectedUpload.status}</dd>
                </div>
                <div>
                  <dt>File profile</dt>
                  <dd>{selectedUpload.format}</dd>
                </div>
                <div>
                  <dt>Extent</dt>
                  <dd>{selectedUpload.extent}</dd>
                </div>
                <div>
                  <dt>Demo upload date</dt>
                  <dd>{formatUploadDate(selectedUpload.uploadedAt)}</dd>
                </div>
              </dl>
            </div>

            <div className={styles.dialogTags} aria-label="Record tags">
              {selectedUpload.tags.map((tag) => <span key={tag}>{tag}</span>)}
            </div>
          </div>
        ) : null}
      </dialog>
    </section>
  );
}

function ClaimCard({
  claim,
  decision,
  onDecide,
}: {
  claim: RobinDemoResearchClaim;
  decision?: ClaimDecision;
  onDecide: (claimId: string, status: ClaimDecisionStatus, note?: string) => void;
}) {
  const [requestingChanges, setRequestingChanges] = useState(false);
  const [changeNote, setChangeNote] = useState(decision?.note ?? "");

  return (
    <article className={styles.claim} data-decision={decision?.status ?? "pending"}>
      <header className={styles.claimHeader}>
        <div>
          <p>{claim.person}</p>
          <span>{claim.origin === "live" ? "New from this research run" : "Seeded web suggestion"}</span>
        </div>
        <span className={styles.claimState}>
          {decision ? decisionLabel(decision.status) : "Awaiting Robin"}
        </span>
      </header>

      <div className={styles.claimStatement}>
        <p>Proposed archive claim</p>
        <blockquote>{claim.claim}</blockquote>
      </div>

      <div className={styles.evidenceNote}>
        <p>Evidence note · paraphrased, not a quotation</p>
        <span>{claim.evidenceParaphrase}</span>
      </div>

      <div className={styles.sourceBlock}>
        <div>
          <span>{claim.sourceKind}</span>
          <a href={claim.sourceUrl} target="_blank" rel="noreferrer">
            {claim.sourceLabel}<span aria-hidden="true"> ↗</span>
          </a>
        </div>
        <p>{claim.caution}</p>
      </div>

      {decision?.note ? (
        <p className={styles.savedNote}>
          <strong>Robin’s note:</strong> {decision.note}
        </p>
      ) : null}

      {requestingChanges ? (
        <form
          className={styles.changeForm}
          onSubmit={(event) => {
            event.preventDefault();
            const note = changeNote.trim();
            if (!note) return;
            onDecide(claim.id, "changes-requested", note);
            setRequestingChanges(false);
          }}
        >
          <label htmlFor={`${claim.id}-change-note`}>What should the research pass clarify?</label>
          <textarea
            id={`${claim.id}-change-note`}
            rows={2}
            value={changeNote}
            onChange={(event) => setChangeNote(event.target.value)}
            placeholder="For example: locate a fuller testimony before approving the chronology."
            required
          />
          <div>
            <button type="submit">Save request</button>
            <button type="button" onClick={() => setRequestingChanges(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className={styles.claimActions} aria-label={`Review claim about ${claim.person}`}>
          <button type="button" onClick={() => onDecide(claim.id, "approved")}>Approve</button>
          <button type="button" onClick={() => onDecide(claim.id, "rejected")}>Reject</button>
          <button type="button" onClick={() => setRequestingChanges(true)}>Request changes</button>
        </div>
      )}
    </article>
  );
}

function ResearchReview() {
  const [decisions, setDecisions] = useState<Record<string, ClaimDecision>>({});
  const [catalog, setCatalog] = useState<DemoResearchCatalog | null>(null);
  const [catalogStatus, setCatalogStatus] = useState<"loading" | "ready" | "error">("loading");
  const [survivorName, setSurvivorName] = useState<RobinClaimPerson>("Sam Cohen");
  const [sourceChoice, setSourceChoice] = useState("");
  const [customSourceUrl, setCustomSourceUrl] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [runStatus, setRunStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [runError, setRunError] = useState("");
  const [lastRun, setLastRun] = useState<DemoResearchRunResult | null>(null);
  const [liveClaims, setLiveClaims] = useState<RobinDemoResearchClaim[]>([]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = window.localStorage.getItem(DECISION_STORAGE_KEY);
        if (saved) setDecisions(JSON.parse(saved) as Record<string, ClaimDecision>);
      } catch {
        // The demo remains usable when storage is unavailable or malformed.
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/demo/research", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("The source list could not be loaded.");
        const payload: unknown = await response.json();
        if (!isResearchCatalog(payload)) throw new Error("The source list was not recognized.");
        setCatalog(payload);
        setCatalogStatus("ready");
        setSourceChoice(
          payload.sources.find((source) => source.survivorName === "Sam Cohen")?.id ?? "__custom__",
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setCatalogStatus("error");
      });
    return () => controller.abort();
  }, []);

  function decide(claimId: string, status: ClaimDecisionStatus, note?: string) {
    setDecisions((current) => {
      const next = {
        ...current,
        [claimId]: { status, note, updatedAt: new Date().toISOString() },
      };
      try {
        window.localStorage.setItem(DECISION_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // The visible decision still works for this session if storage is blocked.
      }
      return next;
    });
  }

  async function retryCatalog() {
    setCatalogStatus("loading");
    try {
      const response = await fetch("/api/demo/research", { cache: "no-store" });
      const payload: unknown = await response.json();
      if (!response.ok || !isResearchCatalog(payload)) throw new Error("Source list unavailable");
      setCatalog(payload);
      setCatalogStatus("ready");
      setSourceChoice(
        payload.sources.find((source) => source.survivorName === survivorName)?.id ?? "__custom__",
      );
    } catch {
      setCatalogStatus("error");
    }
  }

  async function runResearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmed || !sourceChoice) return;
    const isCustomSource = sourceChoice === "__custom__";
    const sourceUrl = customSourceUrl.trim();
    if (isCustomSource && !sourceUrl) return;

    setRunStatus("loading");
    setRunError("");
    setLastRun(null);
    try {
      const response = await fetch("/api/demo/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          survivorName,
          confirmed: true,
          ...(isCustomSource ? { sourceUrl } : { sourceId: sourceChoice }),
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(researchErrorMessage(payload));
      if (!isResearchRunResult(payload)) throw new Error("The research response was not recognized.");

      const mappedClaims: RobinDemoResearchClaim[] = payload.claims.map((claim) => ({
        id: claim.id,
        person: claim.subject,
        claim: claim.value,
        evidenceParaphrase: claim.evidenceNote,
        sourceLabel: claim.sourceTitle,
        sourceUrl: claim.sourceUrl,
        sourceKind: `Live allowlisted retrieval · ${claim.field.replaceAll("_", " ")}`,
        caution:
          payload.limitations.join(" ") ||
          "This suggestion remains unapproved until Robin completes source review.",
        origin: "live",
      }));

      setLiveClaims((current) => {
        const deduped = new Map(current.map((claim) => [claim.id, claim]));
        for (const claim of mappedClaims) deduped.set(claim.id, claim);
        return [...deduped.values()];
      });
      setLastRun(payload);
      setRunStatus("success");
      setConfirmed(false);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "The research run could not be completed.");
      setRunStatus("error");
    }
  }

  const filteredSources = catalog?.sources.filter(
    (source) => source.survivorName === survivorName,
  ) ?? [];
  const selectedKnownSource = filteredSources.find((source) => source.id === sourceChoice);
  const allClaims = useMemo(() => {
    const deduped = new Map<string, RobinDemoResearchClaim>();
    for (const claim of ROBIN_DEMO_RESEARCH_CLAIMS) deduped.set(claim.id, claim);
    for (const claim of liveClaims) deduped.set(claim.id, claim);
    return [...deduped.values()];
  }, [liveClaims]);
  const approvedCount = allClaims.filter(
    (claim) => decisions[claim.id]?.status === "approved",
  ).length;
  const reviewedCount = allClaims.filter((claim) => decisions[claim.id]).length;
  const canRun =
    catalogStatus === "ready" &&
    confirmed &&
    Boolean(sourceChoice) &&
    (sourceChoice !== "__custom__" || Boolean(customSourceUrl.trim()));

  return (
    <section className={styles.researchSection} id="research" aria-labelledby="research-heading">
      <div className={styles.sectionLead}>
        <p className={styles.chapter}>03 / Research inbox</p>
        <div>
          <h2 id="research-heading">The web may suggest. Robin decides.</h2>
          <p>
            Retrieve one curator-selected, allowlisted source at a time, compare its text with
            bounded evidence rules, then decide claim by claim. This is not a general web search.
          </p>
        </div>
      </div>

      <div className={styles.researchRunner} aria-labelledby="research-runner-heading">
        <div className={styles.runnerIntro}>
          <p>Bounded web retrieval · no credits</p>
          <h3 id="research-runner-heading">Open a source for evidence.</h3>
          <span>
            The server fetches only public HTTPS pages on its HMMSA and YouTube allowlist. It does
            not crawl links, search the wider internet, or approve anything automatically.
          </span>
        </div>

        <form className={styles.researchRunForm} onSubmit={runResearch}>
          <div className={styles.runnerFields}>
            <div>
              <label htmlFor="research-survivor">Survivor record</label>
              <select
                id="research-survivor"
                value={survivorName}
                disabled={catalogStatus !== "ready" || runStatus === "loading"}
                onChange={(event) => {
                  const nextPerson = event.target.value as RobinClaimPerson;
                  setSurvivorName(nextPerson);
                  setSourceChoice(
                    catalog?.sources.find((source) => source.survivorName === nextPerson)?.id ??
                      "__custom__",
                  );
                  setCustomSourceUrl("");
                  setConfirmed(false);
                }}
              >
                {(catalog?.survivors ?? ["Sam Cohen", "Stephan Jalnos"]).map((person) => (
                  <option key={person}>{person}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="research-source">Curator-selected source</label>
              <select
                id="research-source"
                value={sourceChoice}
                disabled={catalogStatus !== "ready" || runStatus === "loading"}
                onChange={(event) => {
                  setSourceChoice(event.target.value);
                  setConfirmed(false);
                }}
              >
                {filteredSources.map((source) => (
                  <option key={source.id} value={source.id}>{source.title}</option>
                ))}
                <option value="__custom__">Custom curator URL (allowlisted domains only)</option>
              </select>
            </div>
          </div>

          {sourceChoice === "__custom__" ? (
            <div className={styles.customSourceField}>
              <label htmlFor="research-custom-url">Complete HTTPS source URL</label>
              <input
                id="research-custom-url"
                type="url"
                inputMode="url"
                maxLength={1200}
                value={customSourceUrl}
                onChange={(event) => {
                  setCustomSourceUrl(event.target.value);
                  setConfirmed(false);
                }}
                placeholder="https://www.hmmsa.org/…"
                disabled={runStatus === "loading"}
                required
              />
              <span>
                Allowed hosts: {catalog?.allowedDomains.join(", ") ?? "HMMSA.org and YouTube.com"}
              </span>
            </div>
          ) : selectedKnownSource ? (
            <div className={styles.selectedSourcePreview}>
              <div>
                <span>{selectedKnownSource.publisher}</span>
                <strong>{selectedKnownSource.title}</strong>
              </div>
              <a href={selectedKnownSource.url} target="_blank" rel="noreferrer">
                Inspect source <span aria-hidden="true">↗</span>
              </a>
            </div>
          ) : null}

          {catalogStatus === "loading" ? (
            <p className={styles.catalogStatus} role="status">Loading the approved source list…</p>
          ) : null}
          {catalogStatus === "error" ? (
            <div className={styles.catalogError} role="alert">
              <span>The approved source list is unavailable.</span>
              <button type="button" onClick={() => void retryCatalog()}>Try again</button>
            </div>
          ) : null}

          <label className={styles.researchConfirmation}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              disabled={catalogStatus !== "ready" || runStatus === "loading"}
            />
            <span>
              I confirm this source is appropriate to retrieve and understand that every returned
              claim still requires my individual review.
            </span>
          </label>

          <div className={styles.runnerSubmit}>
            <p>One source · bounded response · deterministic extraction · no AI credits</p>
            <button type="submit" disabled={!canRun || runStatus === "loading"}>
              {runStatus === "loading" ? "Retrieving source…" : "Run web research"}
            </button>
          </div>
        </form>

        {runStatus === "loading" ? (
          <div className={styles.researchRunLoading} role="status">
            <strong>Reading the selected source</strong>
            <span>Checking the bounded response for exact, pre-defined evidence matches…</span>
          </div>
        ) : null}

        {runStatus === "error" ? (
          <div className={styles.researchRunError} role="alert">
            <strong>Research run not completed</strong>
            <span>{runError}</span>
          </div>
        ) : null}

        {runStatus === "success" && lastRun ? (
          <div className={styles.researchRunResult} role="status">
            <header>
              <div>
                <span>Research run complete</span>
                <strong>{lastRun.source.title}</strong>
              </div>
              <span data-retrieval={lastRun.source.retrieval}>
                {lastRun.source.retrieval === "fetched" ? "Source fetched" : "Metadata only"}
              </span>
            </header>
            <p>{lastRun.evidenceNote}</p>
            <div className={styles.runResultMeta}>
              <a href={lastRun.source.url} target="_blank" rel="noreferrer">
                Open retrieved source <span aria-hidden="true">↗</span>
              </a>
              <span>{lastRun.source.contentType ?? "No text content returned"}</span>
              <span>{lastRun.claims.length} claim{lastRun.claims.length === 1 ? "" : "s"} queued</span>
            </div>
            {lastRun.claims.length === 0 ? (
              <div className={styles.noClaimsNote}>
                <strong>
                  {lastRun.source.retrieval === "metadata-only"
                    ? "Source retained as metadata only"
                    : "No evidence-matched claim returned"}
                </strong>
                <span>
                  Nothing was added to the claim queue. Robin can inspect the source manually;
                  the demo will not infer unsupported facts.
                </span>
              </div>
            ) : null}
            <div className={styles.runLimitations}>
              <strong>Limitations</strong>
              <ul>{lastRun.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
            </div>
            <small>{lastRun.safetyNotice}</small>
          </div>
        ) : null}
      </div>

      <div className={styles.researchGuardrail}>
        <div>
          <strong>Source-backed review queue</strong>
          <p>
            Seeded examples and new live results meet here. Evidence notes are transparent
            paraphrases, every URL opens for inspection, and duplicate claim IDs appear only once.
          </p>
        </div>
        <dl>
          <div>
            <dt>Reviewed</dt>
            <dd>{reviewedCount} / {allClaims.length}</dd>
          </div>
          <div>
            <dt>Approved privately</dt>
            <dd>{approvedCount}</dd>
          </div>
          <div>
            <dt>Published</dt>
            <dd>0</dd>
          </div>
        </dl>
      </div>

      <div className={styles.claimList}>
        {allClaims.map((claim) => (
          <ClaimCard
            key={claim.id}
            claim={claim}
            decision={decisions[claim.id]}
            onDecide={decide}
          />
        ))}
      </div>

      <p className={styles.persistenceNote} role="status">
        Review decisions are saved only in this browser’s local storage for the private demo.
        Approval does not publish a claim.
      </p>
    </section>
  );
}

export function RobinDemo() {
  return (
    <div className={styles.demoShell}>
      <div className={styles.privateBanner} role="note">
        <span>Private prototype</span>
        <strong>Synthetic demonstration data · not a production archive</strong>
        <span>No changes publish from this page</span>
      </div>

      <header className={styles.masthead}>
        <a className={styles.wordmark} href="#robin-top" aria-label="Voices archive demo home">
          <span aria-hidden="true">V</span>
          <span>
            <strong>Voices</strong>
            <small>Curatorial archive</small>
          </span>
        </a>
        <nav aria-label="Robin demo sections">
          <a href="#ask-robin">Archive Assistant</a>
          <a href="#uploads">Uploads</a>
          <a href="#research">Research review</a>
        </nav>
        <div className={styles.robinIdentity}>
          <span aria-hidden="true">R</span>
          <div>
            <strong>Robin</strong>
            <small>Curator workspace</small>
          </div>
        </div>
      </header>

      <main id="main-content">
        <section className={styles.hero} id="robin-top" aria-labelledby="robin-title">
          <div className={styles.heroCopy}>
            <p className={styles.chapter}>01 / Command desk</p>
            <h1 id="robin-title">Good afternoon, Robin.</h1>
            <p className={styles.heroLead}>
              A private place to listen closely, follow the evidence, and decide what belongs in
              the record.
            </p>
            <dl className={styles.deskLedger}>
              <div>
                <dt>Synthetic uploads</dt>
                <dd>23</dd>
              </div>
              <div>
                <dt>Seeded claims at start</dt>
                <dd>4</dd>
              </div>
              <div>
                <dt>Published from demo</dt>
                <dd>0</dd>
              </div>
            </dl>
            <div className={styles.heroPrinciple}>
              <span>Today’s principle</span>
              <p>When the source is silent, the archive stays silent too.</p>
            </div>
          </div>
          <AgentDesk />
        </section>

        <UploadLibrary />
        <ResearchReview />
      </main>

      <footer className={styles.demoFooter}>
        <div>
          <strong>Private Robin workspace prototype</strong>
          <span>All uploaded items are synthetic fixtures. Research links open public sources.</span>
        </div>
        <a href="#robin-top">Return to command desk <span aria-hidden="true">↑</span></a>
      </footer>
    </div>
  );
}
