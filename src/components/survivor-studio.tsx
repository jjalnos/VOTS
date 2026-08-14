"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  STUDIO_CHAPTER_STATUSES,
  STUDIO_DOSSIERS,
  type ChapterStatus,
  type EvidenceState,
  type StudioChapter,
  type StudioDossier,
  type StudioSurvivorSlug,
} from "@/lib/data/survivor-studio";
import styles from "./survivor-studio.module.css";

type StudioView = "evidence" | "manuscript" | "citation" | "persona";
type CitationStyle = "Chicago" | "MLA" | "APA";

interface ChapterEdit {
  status: ChapterStatus;
  note: string;
}

type ChapterEdits = Record<string, ChapterEdit>;

interface ResearchTask {
  id: string;
  survivorSlug: StudioSurvivorSlug;
  text: string;
  complete: boolean;
}

interface CitationResponse {
  citation: string;
  bibliography?: string;
  shortCitation?: string;
  source: { id?: string; label: string; href: string };
  style: string;
  answer?: string;
  mode?: string;
  evidenceGaps?: Array<{ id?: string; statement?: string }>;
}

interface PersonaCitation {
  label: string;
  href: string;
}

interface PersonaResponse {
  answer: string;
  citations: PersonaCitation[];
  evidenceStatus: "grounded" | "gap";
  guardrail: string;
  suggestions: string[];
  evidenceGaps?: Array<{ id?: string; statement?: string }>;
  mode?: string;
}

interface PersonaMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: PersonaCitation[];
  evidenceStatus?: "grounded" | "gap";
}

const CHAPTER_STORAGE_KEY = "hmmsa-survivor-studio-chapters-v1";
const TASK_STORAGE_KEY = "hmmsa-survivor-studio-research-v1";

const viewLabels: Array<{ id: StudioView; index: string; label: string; note: string }> = [
  { id: "evidence", index: "01", label: "Evidence room", note: "Research & archive" },
  { id: "manuscript", index: "02", label: "Book table", note: "Chapters & notes" },
  { id: "citation", index: "03", label: "Citation desk", note: "Source-ready prose" },
  { id: "persona", index: "04", label: "Guide workshop", note: "Grounded dialogue" },
];

const evidenceLabels: Record<EvidenceState, string> = {
  approved: "Approved evidence",
  review: "Review task",
  gap: "Open question",
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isCitationResponse(value: unknown): value is CitationResponse {
  if (!isObject(value) || typeof value.citation !== "string" || !isObject(value.source)) {
    return false;
  }
  return typeof value.source.label === "string" && typeof value.source.href === "string";
}

function isPersonaResponse(value: unknown): value is PersonaResponse {
  if (
    !isObject(value) ||
    typeof value.answer !== "string" ||
    typeof value.guardrail !== "string" ||
    !Array.isArray(value.citations) ||
    !Array.isArray(value.suggestions)
  ) {
    return false;
  }
  return value.evidenceStatus === "grounded" || value.evidenceStatus === "gap";
}

function apiError(value: unknown, fallback: string): string {
  return isObject(value) && typeof value.error === "string" ? value.error : fallback;
}

function initialPersonaMessage(dossier: StudioDossier): PersonaMessage {
  return {
    id: `welcome-${dossier.slug}`,
    role: "assistant",
    content: `I’m the archive guide for ${dossier.name}’s curator-approved record. Ask me what the evidence establishes, where the gaps are, or which source belongs beside a passage. I will never speak as ${dossier.name}.`,
    evidenceStatus: "grounded",
  };
}

function chapterValue(chapter: StudioChapter, edits: ChapterEdits): ChapterEdit {
  return edits[chapter.id] ?? { status: chapter.status, note: chapter.note };
}

function saveJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The current session remains functional when storage is unavailable.
  }
}

export function SurvivorStudio() {
  const [survivorSlug, setSurvivorSlug] = useState<StudioSurvivorSlug>("sam-cohen");
  const [view, setView] = useState<StudioView>("evidence");
  const [evidenceFilter, setEvidenceFilter] = useState<EvidenceState | "all">("all");
  const [chapterEdits, setChapterEdits] = useState<ChapterEdits>({});
  const [researchTasks, setResearchTasks] = useState<ResearchTask[]>([]);
  const [newTask, setNewTask] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const dossier = STUDIO_DOSSIERS[survivorSlug];

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const savedChapters = window.localStorage.getItem(CHAPTER_STORAGE_KEY);
        if (savedChapters) setChapterEdits(JSON.parse(savedChapters) as ChapterEdits);
        const savedTasks = window.localStorage.getItem(TASK_STORAGE_KEY);
        if (savedTasks) setResearchTasks(JSON.parse(savedTasks) as ResearchTask[]);
      } catch {
        // Invalid demo storage is ignored rather than blocking the workspace.
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function selectSurvivor(slug: StudioSurvivorSlug) {
    setSurvivorSlug(slug);
    setEvidenceFilter("all");
    setCopyNotice("");
  }

  function updateChapter(chapter: StudioChapter, patch: Partial<ChapterEdit>) {
    setChapterEdits((current) => {
      const previous = chapterValue(chapter, current);
      const next = { ...current, [chapter.id]: { ...previous, ...patch } };
      saveJson(CHAPTER_STORAGE_KEY, next);
      return next;
    });
  }

  function addResearchTask(text: string) {
    const cleaned = text.trim();
    if (!cleaned) return;
    setResearchTasks((current) => {
      const next = [
        ...current,
        {
          id: `${survivorSlug}-task-${current.length + 1}`,
          survivorSlug,
          text: cleaned,
          complete: false,
        },
      ];
      saveJson(TASK_STORAGE_KEY, next);
      return next;
    });
    setNewTask("");
  }

  function toggleResearchTask(id: string) {
    setResearchTasks((current) => {
      const next = current.map((task) =>
        task.id === id ? { ...task, complete: !task.complete } : task,
      );
      saveJson(TASK_STORAGE_KEY, next);
      return next;
    });
  }

  async function copyText(value: string, label: string) {
    try {
      await window.navigator.clipboard.writeText(value);
      setCopyNotice(`${label} copied`);
    } catch {
      setCopyNotice("Copy is unavailable in this browser");
    }
    window.setTimeout(() => setCopyNotice(""), 2200);
  }

  function exportWorkspace() {
    const payload = {
      product: "HMMSA Survivor Studio — private demonstration",
      exportedAt: new Date().toISOString(),
      survivor: { slug: dossier.slug, name: dossier.name },
      archivalNotice:
        "Historical statements are limited to curator-approved demo evidence. Chapter plans, counts, notes, and research tasks are synthetic organizational metadata.",
      approvedSummary: dossier.approvedSummary,
      evidence: dossier.evidence,
      chapters: dossier.chapters.map((chapter) => ({
        ...chapter,
        ...chapterValue(chapter, chapterEdits),
      })),
      researchTasks: researchTasks.filter((task) => task.survivorSlug === dossier.slug),
      sources: dossier.sources,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const href = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `${dossier.slug}-studio-packet.json`;
    link.click();
    window.URL.revokeObjectURL(href);
  }

  const approvedCount = dossier.evidence.filter((item) => item.state === "approved").length;
  const gapCount = dossier.evidence.filter((item) => item.state === "gap").length;
  const activeTasks = researchTasks.filter(
    (task) => task.survivorSlug === survivorSlug && !task.complete,
  ).length;

  return (
    <main className={styles.studioShell} id="main-content">
      <div className={styles.privateNotice}>
        <strong>Private working demonstration</strong>
        <span>Historical claims require curator approval</span>
        <span>Organizational records are synthetic fixtures</span>
      </div>

      <header className={styles.masthead}>
        <Link className={styles.wordmark} href="/demo/robin" aria-label="Return to Robin’s workspace">
          <span aria-hidden="true">V</span>
          <span>
            <strong>Survivor Studio</strong>
            <small>Voices · HMMSA private workspace</small>
          </span>
        </Link>
        <p className={styles.mastheadPurpose}>Research · organize · cite · write · interpret</p>
        <div className={styles.curatorIdentity}>
          <span aria-hidden="true">RJ</span>
          <div>
            <strong>Robin’s studio</strong>
            <small>Curatorial control</small>
          </div>
        </div>
      </header>

      <section className={styles.dossierHeader} aria-labelledby="studio-title">
        <div className={styles.dossierIntro}>
          <p>Active survivor dossier</p>
          <h1 id="studio-title">Build the record.<br />Write from evidence.</h1>
          <span>
            One private place for Robin to research a life, organize the archive, develop a book,
            and shape a museum guide that always shows its sources.
          </span>
        </div>

        <div className={styles.personSelector} aria-label="Choose a survivor dossier">
          {(Object.values(STUDIO_DOSSIERS) as StudioDossier[]).map((person) => (
            <button
              type="button"
              key={person.slug}
              aria-pressed={survivorSlug === person.slug}
              onClick={() => selectSurvivor(person.slug)}
            >
              <span>{person.name}</span>
              <small>{person.contextLine}</small>
            </button>
          ))}
        </div>

        <div className={styles.dossierStatement}>
          <p>Approved record at a glance</p>
          <blockquote>{dossier.approvedSummary}</blockquote>
          <div>
            <span>{approvedCount} approved evidence anchors</span>
            <span>{gapCount} documented gap{gapCount === 1 ? "" : "s"}</span>
            <span>{dossier.archiveCount} demo archive records</span>
          </div>
        </div>
      </section>

      <div className={styles.workspace}>
        <aside className={styles.studioNav} aria-label="Survivor Studio rooms">
          <p>Robin’s working rooms</p>
          <nav>
            {viewLabels.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-current={view === item.id ? "page" : undefined}
                onClick={() => setView(item.id)}
              >
                <span>{item.index}</span>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.note}</small>
                </span>
              </button>
            ))}
          </nav>

          <div className={styles.studioPulse}>
            <p>Today in this dossier</p>
            <dl>
              <div><dt>Evidence anchors</dt><dd>{approvedCount}</dd></div>
              <div><dt>Open research tasks</dt><dd>{activeTasks}</dd></div>
              <div><dt>Book chapters</dt><dd>{dossier.chapters.length}</dd></div>
            </dl>
          </div>

          <div className={styles.exportArea}>
            <button type="button" onClick={exportWorkspace}>Export working packet</button>
            <small>JSON · private demo data · no publication action</small>
          </div>
        </aside>

        <section className={styles.workSurface} aria-live="polite">
          {view === "evidence" ? (
            <EvidenceRoom
              dossier={dossier}
              evidenceFilter={evidenceFilter}
              setEvidenceFilter={setEvidenceFilter}
              tasks={researchTasks.filter((task) => task.survivorSlug === survivorSlug)}
              newTask={newTask}
              setNewTask={setNewTask}
              addTask={addResearchTask}
              toggleTask={toggleResearchTask}
            />
          ) : null}
          {view === "manuscript" ? (
            <BookTable dossier={dossier} edits={chapterEdits} updateChapter={updateChapter} />
          ) : null}
          {view === "citation" ? (
            <CitationDesk key={`citation-${dossier.slug}`} dossier={dossier} onCopy={copyText} />
          ) : null}
          {view === "persona" ? (
            <GuideWorkshop key={`guide-${dossier.slug}`} dossier={dossier} onCopy={copyText} />
          ) : null}
        </section>
      </div>

      <footer className={styles.studioFooter}>
        <p>
          <strong>Designed to travel.</strong> The same evidence model can support additional
          museums while each institution retains its own sources, approvals, families, and voice policy.
        </p>
        <span>Future-ready: multilingual collections · museum kiosks · consent-governed voice</span>
      </footer>

      <div className={styles.copyToast} role="status" aria-live="polite">
        {copyNotice}
      </div>
    </main>
  );
}

function EvidenceRoom({
  dossier,
  evidenceFilter,
  setEvidenceFilter,
  tasks,
  newTask,
  setNewTask,
  addTask,
  toggleTask,
}: {
  dossier: StudioDossier;
  evidenceFilter: EvidenceState | "all";
  setEvidenceFilter: (filter: EvidenceState | "all") => void;
  tasks: ResearchTask[];
  newTask: string;
  setNewTask: (value: string) => void;
  addTask: (value: string) => void;
  toggleTask: (id: string) => void;
}) {
  const visibleEvidence = dossier.evidence.filter(
    (item) => evidenceFilter === "all" || item.state === evidenceFilter,
  );
  const sourceById = new Map(dossier.sources.map((source) => [source.id, source]));

  return (
    <div className={styles.room}>
      <header className={styles.roomHeading}>
        <div>
          <p>01 / Research and archive</p>
          <h2>Every sentence earns its place.</h2>
        </div>
        <span>
          Approved evidence, unresolved questions, and Robin’s next research moves stay visibly separate.
        </span>
      </header>

      <div className={styles.evidenceLayout}>
        <section className={styles.ledger} aria-labelledby="evidence-ledger-heading">
          <div className={styles.ledgerHeader}>
            <div>
              <p>Evidence ledger</p>
              <h3 id="evidence-ledger-heading">{dossier.name}</h3>
            </div>
            <div className={styles.ledgerFilters} aria-label="Filter evidence ledger">
              {(["all", "approved", "review", "gap"] as const).map((filter) => (
                <button
                  type="button"
                  key={filter}
                  aria-pressed={evidenceFilter === filter}
                  onClick={() => setEvidenceFilter(filter)}
                >
                  {filter === "all" ? "All" : evidenceLabels[filter]}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.evidenceList}>
            {visibleEvidence.map((item) => {
              const source = item.sourceId ? sourceById.get(item.sourceId) : undefined;
              return (
                <article key={item.id} className={styles.evidenceEntry} data-state={item.state}>
                  <span className={styles.evidenceState}>{evidenceLabels[item.state]}</span>
                  <div>
                    <h4>{item.label}</h4>
                    <p>{item.detail}</p>
                    {source ? (
                      <a href={source.href} target="_blank" rel="noreferrer">
                        {source.label} <span aria-hidden="true">↗</span>
                      </a>
                    ) : (
                      <span className={styles.noSource}>No approved source attached</span>
                    )}
                  </div>
                  {item.state !== "approved" ? (
                    <button type="button" onClick={() => addTask(item.label)}>
                      Add to research queue
                    </button>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>

        <aside className={styles.researchColumn}>
          <section className={styles.researchQueue} aria-labelledby="research-queue-heading">
            <p>Robin’s research queue</p>
            <h3 id="research-queue-heading">Questions before prose</h3>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                addTask(newTask);
              }}
            >
              <label htmlFor="studio-research-task">Add a question or source task</label>
              <textarea
                id="studio-research-task"
                rows={3}
                maxLength={280}
                value={newTask}
                onChange={(event) => setNewTask(event.target.value)}
                placeholder={dossier.researchPrompts[0]}
              />
              <button type="submit" disabled={!newTask.trim()}>Add to queue</button>
            </form>
            <div className={styles.taskList}>
              {tasks.length ? tasks.map((task) => (
                <label key={task.id} data-complete={task.complete ? "true" : "false"}>
                  <input
                    type="checkbox"
                    checked={task.complete}
                    onChange={() => toggleTask(task.id)}
                  />
                  <span>{task.text}</span>
                </label>
              )) : (
                <p className={styles.emptyTasks}>Nothing queued yet. Open questions can be sent here from the ledger.</p>
              )}
            </div>
            <div className={styles.researchEscalation}>
              <strong>Need a source beyond the reviewed record?</strong>
              <p>
                Move this question into the controlled research inbox. Retrieved material
                remains a lead until Robin approves each claim.
              </p>
              <Link href="/demo/robin#research">
                Open source research <span aria-hidden="true">→</span>
              </Link>
            </div>
          </section>

          <section className={styles.archiveMap} aria-labelledby="archive-map-heading">
            <p>Archive organization</p>
            <h3 id="archive-map-heading">{dossier.archiveCount} records in view</h3>
            <span>Counts and groupings below are synthetic workflow fixtures.</span>
            <dl>
              {dossier.archiveGroups.map((group) => (
                <div key={group.label}>
                  <dt>{group.label}<small>{group.note}</small></dt>
                  <dd>{String(group.count).padStart(2, "0")}</dd>
                </div>
              ))}
            </dl>
            <Link href="/demo/robin#uploads">Open the paginated archive <span aria-hidden="true">→</span></Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

function BookTable({
  dossier,
  edits,
  updateChapter,
}: {
  dossier: StudioDossier;
  edits: ChapterEdits;
  updateChapter: (chapter: StudioChapter, patch: Partial<ChapterEdit>) => void;
}) {
  const readyCount = dossier.chapters.filter(
    (chapter) => chapterValue(chapter, edits).status === "Ready for Robin",
  ).length;

  return (
    <div className={styles.room}>
      <header className={styles.roomHeading}>
        <div>
          <p>02 / Manuscript organization</p>
          <h2>The book grows beside the archive.</h2>
        </div>
        <span>
          Chapter order is a private planning fixture. Notes and statuses save in this browser as Robin works.
        </span>
      </header>

      <section className={styles.manuscriptOverview}>
        <div>
          <p>Working manuscript · {dossier.name}</p>
          <h3>{dossier.chapters.length} chapters on the table</h3>
        </div>
        <dl>
          <div><dt>Ready for Robin</dt><dd>{readyCount}</dd></div>
          <div><dt>Open evidence gaps</dt><dd>{dossier.evidence.filter((item) => item.state === "gap").length}</dd></div>
          <div><dt>Approved anchors</dt><dd>{dossier.evidence.filter((item) => item.state === "approved").length}</dd></div>
        </dl>
      </section>

      <div className={styles.chapterBoard}>
        {dossier.chapters.map((chapter) => {
          const value = chapterValue(chapter, edits);
          return (
            <article key={chapter.id} className={styles.chapterRow}>
              <span className={styles.chapterNumber}>{chapter.number}</span>
              <div className={styles.chapterTitle}>
                <p>Working chapter</p>
                <h3>{chapter.title}</h3>
                <span>{chapter.evidenceLabel}</span>
              </div>
              <div className={styles.chapterStatus}>
                <label htmlFor={`${chapter.id}-status`}>Editorial stage</label>
                <select
                  id={`${chapter.id}-status`}
                  value={value.status}
                  onChange={(event) =>
                    updateChapter(chapter, { status: event.target.value as ChapterStatus })
                  }
                >
                  {STUDIO_CHAPTER_STATUSES.map((status) => <option key={status}>{status}</option>)}
                </select>
              </div>
              <div className={styles.chapterNote}>
                <label htmlFor={`${chapter.id}-note`}>Robin’s private note</label>
                <textarea
                  id={`${chapter.id}-note`}
                  rows={3}
                  maxLength={600}
                  value={value.note}
                  onChange={(event) => updateChapter(chapter, { note: event.target.value })}
                />
                <span>Saved to this browser</span>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function CitationDesk({
  dossier,
  onCopy,
}: {
  dossier: StudioDossier;
  onCopy: (value: string, label: string) => Promise<void>;
}) {
  const [question, setQuestion] = useState(`What approved source supports the current account of ${dossier.name}?`);
  const [style, setStyle] = useState<CitationStyle>("Chicago");
  const [sourceId, setSourceId] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [result, setResult] = useState<CitationResponse | null>(null);
  const [error, setError] = useState("");
  const requestController = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      requestController.current?.abort();
    },
    [],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setQuestion(`What approved source supports the current account of ${dossier.name}?`);
      setSourceId("");
      setResult(null);
      setStatus("idle");
      setError("");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [dossier.name]);

  async function buildCitation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (question.trim().length < 2) return;
    setStatus("loading");
    setError("");
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    try {
      const response = await fetch("/api/demo/studio/cite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          institutionId: "hmmsa",
          survivorSlug: dossier.slug,
          question: question.trim(),
          style,
          ...(sourceId ? { sourceId } : {}),
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(payload, "The citation desk could not complete this request."));
      if (!isCitationResponse(payload)) throw new Error("The citation response was not recognized.");
      if (controller.signal.aborted) return;
      setResult(payload);
      setStatus("success");
    } catch (caught) {
      if (controller.signal.aborted) return;
      setResult(null);
      setError(caught instanceof Error ? caught.message : "The citation desk is unavailable.");
      setStatus("error");
    } finally {
      if (requestController.current === controller) requestController.current = null;
    }
  }

  return (
    <div className={styles.room}>
      <header className={styles.roomHeading}>
        <div>
          <p>03 / Citation desk</p>
          <h2>Move from claim to citation.</h2>
        </div>
        <span>
          Ask what supports a passage. The desk returns an approved source, formatted citation, and any evidence warning.
        </span>
      </header>

      <div className={styles.citationLayout}>
        <form className={styles.citationForm} onSubmit={buildCitation}>
          <div className={styles.deskFolio}>
            <p>Working inquiry · {dossier.name}</p>
            <label htmlFor="citation-question">What are you trying to support?</label>
            <textarea
              id="citation-question"
              rows={5}
              minLength={2}
              maxLength={700}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              required
            />
          </div>

          <div className={styles.citationControls}>
            <div>
              <label htmlFor="citation-style">Citation style</label>
              <select
                id="citation-style"
                value={style}
                onChange={(event) => setStyle(event.target.value as CitationStyle)}
              >
                <option>Chicago</option>
                <option>MLA</option>
                <option>APA</option>
              </select>
            </div>
            <div>
              <label htmlFor="citation-source">Source preference</label>
              <select id="citation-source" value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
                <option value="">Let the evidence desk choose</option>
                {dossier.sources
                  .filter((source) => source.role === "approved-evidence")
                  .map((source) => <option key={source.id} value={source.id}>{source.label}</option>)}
              </select>
            </div>
          </div>

          <button className={styles.primaryAction} type="submit" disabled={status === "loading" || question.trim().length < 2}>
            {status === "loading" ? "Reading approved evidence…" : "Build cited answer"}
          </button>
          <p className={styles.formAssurance}>Approved sources only · deterministic demo · no AI credits</p>
        </form>

        <section className={styles.citationResult} aria-labelledby="citation-result-heading">
          <p>Publication-ready output</p>
          <h3 id="citation-result-heading">Citation proof</h3>
          {status === "idle" ? (
            <div className={styles.blankProof}>
              <strong>The margin is ready.</strong>
              <span>Run an inquiry to place evidence beside the manuscript instead of chasing it later.</span>
            </div>
          ) : null}
          {status === "loading" ? <div className={styles.loadingProof} role="status">Checking the approved source ledger…</div> : null}
          {status === "error" ? <div className={styles.errorProof} role="alert"><strong>Citation not created</strong><span>{error}</span></div> : null}
          {status === "success" && result ? (
            <div className={styles.proofOutput}>
              {result.answer ? <blockquote>{result.answer}</blockquote> : null}
              <div>
                <span>{result.style} bibliography</span>
                <p>{result.bibliography ?? result.citation}</p>
                <button type="button" onClick={() => void onCopy(result.bibliography ?? result.citation, "Bibliography entry")}>Copy bibliography</button>
              </div>
              {result.shortCitation ? (
                <div>
                  <span>Short note</span>
                  <p>{result.shortCitation}</p>
                  <button type="button" onClick={() => void onCopy(result.shortCitation ?? "", "Short citation")}>Copy short note</button>
                </div>
              ) : null}
              <a href={result.source.href} target="_blank" rel="noreferrer">Open {result.source.label} <span aria-hidden="true">↗</span></a>
              {result.evidenceGaps?.length ? (
                <div className={styles.citationWarning}>
                  <strong>Evidence boundary</strong>
                  <span>{result.evidenceGaps[0]?.statement ?? "The approved record does not establish every detail in this inquiry."}</span>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function GuideWorkshop({
  dossier,
  onCopy,
}: {
  dossier: StudioDossier;
  onCopy: (value: string, label: string) => Promise<void>;
}) {
  const [messages, setMessages] = useState<PersonaMessage[]>([initialPersonaMessage(dossier)]);
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState(dossier.personaPrompts);
  const requestController = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      requestController.current?.abort();
    },
    [],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setMessages([initialPersonaMessage(dossier)]);
      setSuggestions(dossier.personaPrompts);
      setPrompt("");
      setStatus("idle");
      setError("");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [dossier]);

  const personaBrief = useMemo(
    () => [
      `${dossier.name} — evidence-grounded archive guide`,
      "Identity: A third-person museum guide. It is never the survivor.",
      `Approved record: ${dossier.approvedSummary}`,
      "Allowed: summarize approved claims, cite sources, identify evidence gaps, support curator organization.",
      "Prohibited: impersonation, invented memories or feelings, unsourced dates, relatives, occupations, dialogue, or quotations.",
      "Publication rule: Robin reviews the record; no assistant answer publishes automatically.",
    ].join("\n\n"),
    [dossier],
  );

  async function sendMessage(value: string) {
    const cleaned = value.trim();
    if (cleaned.length < 2 || status === "loading") return;
    const userMessage: PersonaMessage = {
      id: `user-${messages.length}`,
      role: "user",
      content: cleaned,
    };
    const history = messages
      .slice(-8)
      .map((message) => ({ role: message.role, content: message.content.slice(0, 800) }));
    setMessages((current) => [...current, userMessage]);
    setPrompt("");
    setStatus("loading");
    setError("");
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    try {
      const response = await fetch("/api/demo/studio/persona", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          institutionId: "hmmsa",
          survivorSlug: dossier.slug,
          message: cleaned,
          history,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(payload, "The archive guide could not answer."));
      if (!isPersonaResponse(payload)) throw new Error("The archive guide response was not recognized.");
      if (controller.signal.aborted) return;
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${messages.length + 1}`,
          role: "assistant",
          content: payload.answer,
          citations: payload.citations,
          evidenceStatus: payload.evidenceStatus,
        },
      ]);
      setSuggestions(payload.suggestions.slice(0, 3));
      setStatus("idle");
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : "The archive guide is unavailable.");
      setStatus("error");
    } finally {
      if (requestController.current === controller) requestController.current = null;
    }
  }

  return (
    <div className={styles.room}>
      <header className={styles.roomHeading}>
        <div>
          <p>04 / Evidence-grounded interpretation</p>
          <h2>Build a guide, never an imitation.</h2>
        </div>
        <span>
          Robin defines the evidence boundary. Visitors receive a conversational archive guide with sources—not a synthetic survivor.
        </span>
      </header>

      <div className={styles.personaLayout}>
        <section className={styles.personaBrief} aria-labelledby="persona-brief-heading">
          <p>Persona brief · curator controlled</p>
          <h3 id="persona-brief-heading">{dossier.name} archive guide</h3>
          <div className={styles.identityRule}>
            <strong>Third-person archival narrator</strong>
            <span>This assistant is not {dossier.name} and never recreates his voice.</span>
          </div>
          <dl>
            <div>
              <dt>Evidence boundary</dt>
              <dd>{dossier.evidence.filter((item) => item.state === "approved").length} approved anchors only</dd>
            </div>
            <div>
              <dt>Unknowns</dt>
              <dd>Named plainly; never filled with guesses</dd>
            </div>
            <div>
              <dt>Sources</dt>
              <dd>Visible beside every supported answer</dd>
            </div>
            <div>
              <dt>Publication</dt>
              <dd>Robin retains final approval</dd>
            </div>
          </dl>
          <button type="button" onClick={() => void onCopy(personaBrief, "Persona brief")}>Copy full persona brief</button>

          <div className={styles.voiceReadiness}>
            <p>Future museum mode</p>
            <strong>Kiosk-ready architecture · voice locked</strong>
            <span>Voice output requires explicit consent, family and museum review, pronunciation work, and a separately approved policy.</span>
          </div>
        </section>

        <section className={styles.personaPreview} aria-labelledby="persona-preview-heading">
          <header>
            <div>
              <p>Live grounded preview</p>
              <h3 id="persona-preview-heading">Ask the archive guide</h3>
            </div>
            <span>Sources on · invention off</span>
          </header>

          <div className={styles.personaMessages} aria-live="polite">
            {messages.map((message) => (
              <article key={message.id} data-role={message.role}>
                <div>
                  <span>{message.role === "assistant" ? "Archive guide" : "Robin"}</span>
                  {message.evidenceStatus ? <small>{message.evidenceStatus === "grounded" ? "Grounded answer" : "Evidence gap named"}</small> : null}
                </div>
                <p>{message.content}</p>
                {message.citations?.length ? (
                  <ul aria-label="Sources for this answer">
                    {message.citations.map((citation) => (
                      <li key={citation.href}><a href={citation.href} target="_blank" rel="noreferrer">{citation.label} <span aria-hidden="true">↗</span></a></li>
                    ))}
                  </ul>
                ) : null}
              </article>
            ))}
            {status === "loading" ? <div className={styles.guideThinking} role="status">Checking approved evidence before answering…</div> : null}
            {status === "error" ? <div className={styles.guideError} role="alert"><strong>Preview unavailable</strong><span>{error}</span></div> : null}
          </div>

          <div className={styles.personaSuggestions} aria-label="Suggested questions">
            {suggestions.map((suggestion) => (
              <button type="button" key={suggestion} onClick={() => void sendMessage(suggestion)} disabled={status === "loading"}>{suggestion}</button>
            ))}
          </div>

          <form
            className={styles.personaComposer}
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage(prompt);
            }}
          >
            <label htmlFor="persona-prompt">Ask about the approved record</label>
            <div>
              <textarea
                id="persona-prompt"
                rows={2}
                minLength={2}
                maxLength={700}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={`Ask what the archive establishes about ${dossier.name}…`}
              />
              <button type="submit" disabled={status === "loading" || prompt.trim().length < 2}>Ask</button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
