"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEMO_ARCHIVE_ACCEPT,
  DEMO_ARCHIVE_MAX_FILES,
  DEMO_ARCHIVE_MAX_FILE_BYTES,
  clearDemoArchiveText,
  demoArchiveErrorStatus,
  demoArchiveRetryAfterSeconds,
  formatArchiveBytes,
  getDemoArchiveLibrary,
  uploadDemoArchiveFile,
  validateDemoArchiveFile,
  type DemoArchiveFilters,
  type DemoArchiveLibraryPage,
  type DemoArchiveMediaType,
  type DemoArchiveRecord,
  type DemoArchiveUploadMetadata,
} from "@/lib/demo-archive-client";
import { ArchiveAssistant } from "./archive-assistant";
import styles from "./archive-intake.module.css";

type QueueStatus = "validated" | "uploading" | "saved" | "duplicate" | "error";

interface QueueItem {
  id: string;
  file: File;
  mediaType: DemoArchiveMediaType;
  title: string;
  status: QueueStatus;
  progress: number;
  error?: string;
}

interface IntakeMetadata {
  survivorName: string;
  sourceContributor: string;
  originalLanguage: string;
  consentRights: string;
  rightsStatement: string;
  historicalDate: string;
  notes: string;
  tags: string;
}

const initialMetadata: IntakeMetadata = {
  survivorName: "Sam Cohen",
  sourceContributor: "",
  originalLanguage: "en",
  consentRights: "permission",
  rightsStatement: "Private archive intake. Publication permission must be reviewed separately.",
  historicalDate: "",
  notes: "",
  tags: "",
};

const initialFilters: DemoArchiveFilters = {
  query: "",
  survivor: "all",
  mediaType: "all",
  status: "all",
  page: 1,
  pageSize: 8,
};

const mediaLabels: Record<DemoArchiveMediaType, string> = {
  document: "Document",
  photograph: "Photograph",
  audio: "Audio",
  video: "Video",
};

const statusLabels: Record<string, string> = {
  "needs-review": "Needs review",
  processing: "Processing",
  ready: "Ready",
  "approved-private": "Approved · private",
};

const consentLabels: Record<string, string> = {
  permission: "Permission documented or expected",
  owned: "Museum or family owns the original",
  documented_restriction: "Documented restrictions apply",
  review_required: "Rights review required",
};

const languageLabels: Record<string, string> = {
  en: "English",
  es: "Spanish",
  yi: "Yiddish",
  he: "Hebrew",
  pl: "Polish",
  de: "German",
  other: "Other / mixed",
};

function statusLabel(value: string): string {
  return statusLabels[value] ?? archiveProcessLabel(value);
}

function titleFromFilename(filename: string): string {
  const withoutExtension = filename.replace(/\.[^.]+$/, "");
  return withoutExtension.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function tagsFromInput(value: string): string[] {
  return [...new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean))].slice(0, 16);
}

function formatArchiveDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date not recorded";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function typeIndex(type: DemoArchiveMediaType): string {
  if (type === "document") return "DOC";
  if (type === "photograph") return "IMG";
  if (type === "audio") return "AUD";
  return "VID";
}

function archiveProcessLabel(value: string | undefined): string {
  if (!value) return "Awaiting archive processing";
  return value.replace(/-/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}

function supportsLimitedTextReview(record: DemoArchiveRecord): boolean {
  const extension = record.originalFilename.split(".").pop()?.toLocaleLowerCase("en");
  return (
    record.mediaType === "document" &&
    record.extractionStatus === "text-ready" &&
    ((extension === "txt" && record.mimeType === "text/plain; charset=utf-8") ||
      (extension === "md" && record.mimeType === "text/markdown; charset=utf-8"))
  );
}

export function ArchiveIntake() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [metadata, setMetadata] = useState<IntakeMetadata>(initialMetadata);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dropActive, setDropActive] = useState(false);
  const [queueMessages, setQueueMessages] = useState<string[]>([]);
  const [batchStatus, setBatchStatus] = useState<"idle" | "uploading" | "complete">("idle");
  const [uploadAuthRequired, setUploadAuthRequired] = useState(false);
  const [rateLimitNotice, setRateLimitNotice] = useState("");
  const [libraryRevision, setLibraryRevision] = useState(0);

  function updateMetadata<Key extends keyof IntakeMetadata>(key: Key, value: IntakeMetadata[Key]) {
    setMetadata((current) => ({ ...current, [key]: value }));
  }

  function addFiles(files: File[]) {
    const messages: string[] = [];
    const available = Math.max(0, DEMO_ARCHIVE_MAX_FILES - queue.length);
    const candidates = files.slice(0, available);
    if (files.length > available) {
      messages.push(`The private intake holds ${DEMO_ARCHIVE_MAX_FILES} files at a time. ${files.length - available} file${files.length - available === 1 ? " was" : "s were"} not added.`);
    }
    const known = new Set(
      queue.map((item) => `${item.file.name}:${item.file.size}:${item.file.lastModified}`),
    );
    const additions: QueueItem[] = [];
    for (const file of candidates) {
      const signature = `${file.name}:${file.size}:${file.lastModified}`;
      if (known.has(signature)) {
        messages.push(`${file.name} is already in this batch.`);
        continue;
      }
      const validation = validateDemoArchiveFile(file);
      if (!validation.mediaType || validation.error) {
        messages.push(`${file.name}: ${validation.error ?? "Unsupported file."}`);
        continue;
      }
      known.add(signature);
      additions.push({
        id: crypto.randomUUID(),
        file,
        mediaType: validation.mediaType,
        title: titleFromFilename(file.name) || file.name,
        status: "validated",
        progress: 0,
      });
    }
    setQueueMessages(messages);
    setQueue((current) => [...current, ...additions]);
  }

  function updateQueueTitle(id: string, title: string) {
    setQueue((current) => current.map((item) => (item.id === id ? { ...item, title } : item)));
  }

  function removeQueueItem(id: string) {
    setQueue((current) => current.filter((item) => item.id !== id));
  }

  function queueMetadata(item: QueueItem): DemoArchiveUploadMetadata {
    return {
      clientId: item.id,
      survivorName: metadata.survivorName,
      title: item.title.trim(),
      itemType: item.mediaType,
      sourceContributor: metadata.sourceContributor.trim(),
      originalLanguage: metadata.originalLanguage,
      consentRights: metadata.consentRights,
      rightsStatement: metadata.rightsStatement.trim(),
      historicalDate: metadata.historicalDate || undefined,
      notes: metadata.notes.trim() || undefined,
      tags: tagsFromInput(metadata.tags),
      visibility: "private",
    };
  }

  const metadataReady =
    metadata.survivorName.trim().length > 0 &&
    metadata.sourceContributor.trim().length >= 3 &&
    metadata.rightsStatement.trim().length >= 8;
  const filesReady = queue.some((item) => item.status === "validated" || item.status === "error");

  async function uploadBatch() {
    if (!metadataReady || !filesReady || batchStatus === "uploading") return;
    setBatchStatus("uploading");
    setUploadAuthRequired(false);
    setRateLimitNotice("");
    const eligible = queue.filter((item) => item.status === "validated" || item.status === "error");
    let savedCount = 0;
    let stopped = false;
    for (const item of eligible) {
      if (stopped) break;
      if (item.title.trim().length < 3) {
        setQueue((current) => current.map((entry) =>
          entry.id === item.id
            ? { ...entry, status: "error", error: "Add a descriptive title of at least three characters." }
            : entry,
        ));
        continue;
      }
      setQueue((current) => current.map((entry) =>
        entry.id === item.id
          ? { ...entry, status: "uploading", progress: 1, error: undefined }
          : entry,
      ));
      let attemptId = item.id;
      let retriedConflict = false;
      while (true) {
        try {
          await uploadDemoArchiveFile(
            item.file,
            { ...queueMetadata(item), clientId: attemptId },
            (progress) => {
              setQueue((current) => current.map((entry) =>
                entry.id === item.id ? { ...entry, progress } : entry,
              ));
            },
          );
          savedCount += 1;
          setQueue((current) => current.map((entry) =>
            entry.id === item.id ? { ...entry, status: "saved", progress: 100 } : entry,
          ));
        } catch (error) {
          const errorStatus = demoArchiveErrorStatus(error);
          const message =
            error instanceof Error ? error.message : "The archive could not save this file.";
          if (errorStatus === 409 && /retry key/i.test(message) && !retriedConflict) {
            retriedConflict = true;
            attemptId = crypto.randomUUID();
            continue;
          }
          if (errorStatus === 409) {
            setQueue((current) => current.map((entry) =>
              entry.id === item.id
                ? { ...entry, status: "duplicate", progress: 100, error: undefined }
                : entry,
            ));
            break;
          }
          if (errorStatus === 401) {
            setUploadAuthRequired(true);
            stopped = true;
            setQueue((current) => current.map((entry) =>
              entry.id === item.id
                ? { ...entry, status: "validated", progress: 0, error: undefined }
                : entry,
            ));
            break;
          }
          if (errorStatus === 429) {
            const retryAfter = demoArchiveRetryAfterSeconds(error);
            const minutes = retryAfter ? Math.max(1, Math.ceil(retryAfter / 60)) : null;
            setRateLimitNotice(
              minutes
                ? `The archive is pacing uploads. It accepts more originals in about ${minutes} minute${minutes === 1 ? "" : "s"} — your queue is untouched.`
                : "The archive is pacing uploads. Wait a few minutes and save the batch again — your queue is untouched.",
            );
            stopped = true;
            setQueue((current) => current.map((entry) =>
              entry.id === item.id
                ? { ...entry, status: "validated", progress: 0, error: undefined }
                : entry,
            ));
            break;
          }
          setQueue((current) => current.map((entry) =>
            entry.id === item.id
              ? { ...entry, status: "error", progress: 0, error: message }
              : entry,
          ));
          break;
        }
        break;
      }
    }
    setBatchStatus("complete");
    if (savedCount) setLibraryRevision((revision) => revision + 1);
  }

  const counts = useMemo(() => ({
    queued: queue.filter((item) => item.status === "validated").length,
    uploading: queue.filter((item) => item.status === "uploading").length,
    saved: queue.filter((item) => item.status === "saved" || item.status === "duplicate").length,
    errors: queue.filter((item) => item.status === "error").length,
  }), [queue]);

  return (
    <div className={styles.archiveShell}>
      <div className={styles.privateBanner}>
        <strong>Authenticated archive workspace</strong>
        <span>Encrypted PostgreSQL demo</span>
        <span>Every original enters private and quarantined</span>
      </div>

      <header className={styles.masthead}>
        <Link className={styles.wordmark} href="/demo/robin" aria-label="Return to Robin’s main workspace">
          <span aria-hidden="true">V</span>
          <span>
            <strong>Archive Intake</strong>
            <small>Voices · HMMSA private workspace</small>
          </span>
        </Link>
        <nav aria-label="Robin archive navigation">
          <Link href="/demo/robin/studio">Survivor Studio</Link>
          <a href="#intake">New intake</a>
          <a href="#library">Private library</a>
          <a href="#assistant">Ask archive</a>
        </nav>
        <div className={styles.robinIdentity}>
          <span aria-hidden="true">RJ</span>
          <div><strong>Robin’s archive</strong><small>Curatorial control</small></div>
        </div>
      </header>

      <main id="main-content">
      <section className={styles.hero} aria-labelledby="archive-title">
        <div>
          <p>Archive intake & private library</p>
          <h1 id="archive-title">Bring every piece<br />into the record.</h1>
          <span>
            Photographs, documents, recordings, and film arrive with their story, source,
            rights, and survivor connection intact.
          </span>
        </div>
        <aside>
          <p>Robin’s intake promise</p>
          <blockquote>
            Nothing becomes public because it was uploaded. Every record waits for evidence,
            rights, and curatorial review.
          </blockquote>
          <dl>
            <div><dt>Batch capacity</dt><dd>{DEMO_ARCHIVE_MAX_FILES} files</dd></div>
            <div><dt>Accepted media</dt><dd>4 families</dd></div>
            <div><dt>Default visibility</dt><dd>Private</dd></div>
          </dl>
        </aside>
      </section>

      <section className={styles.intakeSection} id="intake" aria-labelledby="intake-heading">
        <header className={styles.sectionHeading}>
          <div><p>01 / Receive and describe</p><h2 id="intake-heading">An intake desk, not a file dump.</h2></div>
          <span>
            Describe the batch once, refine each title, and see the status of every original as it enters the private archive.
          </span>
        </header>

        <div className={styles.intakeDesk}>
          <form className={styles.metadataFolio} onSubmit={(event) => event.preventDefault()}>
            <div className={styles.folioHeading}>
              <span>Batch record</span>
              <strong>Shared metadata</strong>
              <small>Applies to every file in this intake</small>
            </div>

            <div className={styles.fieldGrid}>
              <div className={styles.field}>
                <label htmlFor="intake-survivor">Survivor or collection</label>
                <select id="intake-survivor" value={metadata.survivorName} onChange={(event) => updateMetadata("survivorName", event.target.value)}>
                  <option>Sam Cohen</option>
                  <option>Stephan Jalnos</option>
                  <option>Shared research</option>
                  <option>Unassigned intake</option>
                </select>
              </div>
              <div className={styles.field}>
                <label htmlFor="intake-language">Original language</label>
                <select id="intake-language" value={metadata.originalLanguage} onChange={(event) => updateMetadata("originalLanguage", event.target.value)}>
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="yi">Yiddish</option>
                  <option value="he">Hebrew</option>
                  <option value="pl">Polish</option>
                  <option value="de">German</option>
                  <option value="other">Other / mixed</option>
                </select>
              </div>
              <div className={`${styles.field} ${styles.wideField}`}>
                <label htmlFor="intake-contributor">Source or contributor</label>
                <input
                  id="intake-contributor"
                  minLength={3}
                  maxLength={240}
                  value={metadata.sourceContributor}
                  onChange={(event) => updateMetadata("sourceContributor", event.target.value)}
                  placeholder="Family member, museum collection, or source name"
                  required
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="intake-date">Historical date, if known</label>
                <input id="intake-date" type="date" value={metadata.historicalDate} onChange={(event) => updateMetadata("historicalDate", event.target.value)} />
              </div>
              <div className={styles.field}>
                <label htmlFor="intake-rights">Consent / rights basis</label>
                <select id="intake-rights" value={metadata.consentRights} onChange={(event) => updateMetadata("consentRights", event.target.value)}>
                  <option value="permission">Permission documented or expected</option>
                  <option value="owned">Museum or family owns the original</option>
                  <option value="documented_restriction">Documented restrictions apply</option>
                  <option value="review_required">Rights review required</option>
                </select>
              </div>
              <div className={`${styles.field} ${styles.wideField}`}>
                <label htmlFor="intake-rights-statement">Rights and restriction note</label>
                <textarea
                  id="intake-rights-statement"
                  rows={3}
                  minLength={8}
                  maxLength={2000}
                  value={metadata.rightsStatement}
                  onChange={(event) => updateMetadata("rightsStatement", event.target.value)}
                  required
                />
              </div>
              <div className={`${styles.field} ${styles.wideField}`}>
                <label htmlFor="intake-notes">Context and handling notes</label>
                <textarea
                  id="intake-notes"
                  rows={3}
                  maxLength={2400}
                  value={metadata.notes}
                  onChange={(event) => updateMetadata("notes", event.target.value)}
                  placeholder="What Robin should know before reviewing these originals"
                />
              </div>
              <div className={`${styles.field} ${styles.wideField}`}>
                <label htmlFor="intake-tags">Working tags</label>
                <input
                  id="intake-tags"
                  value={metadata.tags}
                  onChange={(event) => updateMetadata("tags", event.target.value)}
                  placeholder="place, person, event — separated by commas"
                />
              </div>
            </div>

            <div className={styles.privateAssurance}>
              <span aria-hidden="true">✓</span>
              <div><strong>Private by default</strong><p>This intake remains invisible to the public until an authorized curator completes a separate publication review.</p></div>
            </div>
          </form>

          <div className={styles.batchFolio}>
            <div
              className={styles.dropZone}
              data-active={dropActive ? "true" : "false"}
              onDragEnter={(event) => { event.preventDefault(); setDropActive(true); }}
              onDragOver={(event) => { event.preventDefault(); setDropActive(true); }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                  setDropActive(false);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDropActive(false);
                addFiles(Array.from(event.dataTransfer.files));
              }}
            >
              <input
                ref={inputRef}
                className={styles.hiddenInput}
                type="file"
                multiple
                accept={DEMO_ARCHIVE_ACCEPT}
                onChange={(event) => {
                  addFiles(Array.from(event.target.files ?? []));
                  event.target.value = "";
                }}
              />
              <span className={styles.dropIndex} aria-hidden="true">ORIGINALS</span>
              <h3>Drop the family record here.</h3>
              <p>
                Documents, photographs, audio, and video · up to{" "}
                {formatArchiveBytes(DEMO_ARCHIVE_MAX_FILE_BYTES)} each
              </p>
              <button type="button" onClick={() => inputRef.current?.click()}>Choose files</button>
              <small>Nothing leaves this browser until Robin starts the private upload.</small>
            </div>

            {queueMessages.length ? (
              <div className={styles.queueAlert} role="alert">
                <strong>Some files need attention</strong>
                <ul>{queueMessages.map((message) => <li key={message}>{message}</li>)}</ul>
              </div>
            ) : null}

            <div className={styles.queueHeading}>
              <div><p>Batch queue</p><h3>{queue.length ? `${queue.length} original${queue.length === 1 ? "" : "s"} ready for description` : "Waiting for originals"}</h3></div>
              <div aria-label="Batch status summary">
                <span>{counts.queued} ready</span>
                <span>{counts.saved} saved</span>
                {counts.errors ? <span>{counts.errors} need attention</span> : null}
              </div>
            </div>

            <div className={styles.queueList}>
              {queue.length ? queue.map((item) => (
                <article key={item.id} className={styles.queueItem} data-status={item.status}>
                  <span className={styles.mediaIndex}>{typeIndex(item.mediaType)}</span>
                  <div className={styles.queueFile}>
                    <strong>{item.file.name}</strong>
                    <span>{mediaLabels[item.mediaType]} · {formatArchiveBytes(item.file.size)}</span>
                  </div>
                  <div className={styles.queueTitle}>
                    <label htmlFor={`${item.id}-title`}>Archive title</label>
                    <input
                      id={`${item.id}-title`}
                      minLength={3}
                      maxLength={180}
                      value={item.title}
                      disabled={item.status === "uploading" || item.status === "saved"}
                      onChange={(event) => updateQueueTitle(item.id, event.target.value)}
                    />
                  </div>
                  <div className={styles.queueProgress}>
                    <div><span style={{ width: `${item.progress}%` }} /></div>
                    <strong>
                      {item.status === "validated" ? "Validated" : null}
                      {item.status === "uploading" ? `Saving ${item.progress}%` : null}
                      {item.status === "saved" ? "Saved privately" : null}
                      {item.status === "duplicate" ? "Already archived — see the library below" : null}
                      {item.status === "error" ? "Needs attention" : null}
                    </strong>
                    {item.error ? <small>{item.error}</small> : null}
                  </div>
                  {item.status !== "uploading" ? (
                    <button type="button" onClick={() => removeQueueItem(item.id)}>
                      {item.status === "saved" || item.status === "duplicate" ? "Clear" : "Remove"}
                    </button>
                  ) : null}
                </article>
              )) : (
                <div className={styles.emptyQueue}>
                  <strong>Your batch will appear here.</strong>
                  <span>Each original receives its own title, validation result, and upload progress.</span>
                </div>
              )}
            </div>

            {uploadAuthRequired ? (
              <div className={styles.authNotice} role="alert">
                <div>
                  <strong>Archive sign-in required</strong>
                  <span>
                    Sign in from the tab that opens, then come back here and save the batch
                    again. Your queue lives only on this page — keep it open while you sign in.
                  </span>
                </div>
                <a href="/login?returnTo=/demo/robin/archive" target="_blank" rel="noopener">
                  Sign in in a new tab
                </a>
              </div>
            ) : null}

            {rateLimitNotice ? (
              <div className={styles.authNotice} role="status">
                <div>
                  <strong>The archive is pacing uploads</strong>
                  <span>{rateLimitNotice}</span>
                </div>
              </div>
            ) : null}

            <div className={styles.batchSubmit}>
              <div>
                <strong>{metadataReady ? "Shared metadata is ready" : "Complete source and rights details"}</strong>
                <span>Every original enters encrypted quarantine. Eligible UTF-8 .txt/.md files can receive Robin’s separate limited text review; all other formats wait for the production scanner.</span>
              </div>
              <button type="button" disabled={!metadataReady || !filesReady || batchStatus === "uploading"} onClick={() => void uploadBatch()}>
                {batchStatus === "uploading" ? "Saving private originals…" : counts.errors ? "Retry unsaved files" : "Save batch privately"}
              </button>
            </div>
          </div>
        </div>
      </section>

      <ArchiveLibrary revision={libraryRevision} />

      <ArchiveAssistant />

      <section className={styles.afterIntake}>
        <div><p>04 / After intake</p><h2>The archive becomes a working partner.</h2></div>
        <p>Move from private originals to source review, book organization, citations, and a grounded museum guide—without losing provenance.</p>
        <Link href="/demo/robin/studio">Continue in Survivor Studio <span aria-hidden="true">→</span></Link>
      </section>
      </main>

      <footer className={styles.footer}>
        <Link href="/demo/robin">Robin’s main workspace</Link>
        <p>Authenticated encrypted PostgreSQL demo · every original begins quarantined · limited text review is not antivirus · no public publication action</p>
        <span>HMMSA Survivor Studio</span>
      </footer>
    </div>
  );
}

function ArchiveLibrary({ revision }: { revision: number }) {
  const [draftFilters, setDraftFilters] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [page, setPage] = useState<DemoArchiveLibraryPage | null>(null);
  const [error, setError] = useState("");
  const [errorStatus, setErrorStatus] = useState<number>();
  const [selectedRecord, setSelectedRecord] = useState<DemoArchiveRecord | null>(null);
  const [retrySequence, setRetrySequence] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    setError("");
    setErrorStatus(undefined);
    void getDemoArchiveLibrary(filters, controller.signal)
      .then((result) => {
        setPage(result);
        setStatus("ready");
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "The private library is unavailable.");
        setErrorStatus(demoArchiveErrorStatus(caught));
        setStatus("error");
      });
    return () => {
      controller.abort();
    };
  }, [filters, revision, retrySequence]);

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters({ ...draftFilters, page: 1 });
  }

  function changePage(nextPage: number) {
    setFilters((current) => ({ ...current, page: nextPage }));
  }

  function updatePrivateRecord(
    recordId: string,
    update: Pick<DemoArchiveRecord, "scanStatus" | "previewUrl">,
  ) {
    setPage((current) => current
      ? {
          ...current,
          items: current.items.map((item) =>
            item.id === recordId ? { ...item, ...update } : item,
          ),
        }
      : current);
    setSelectedRecord((current) =>
      current?.id === recordId ? { ...current, ...update } : current,
    );
  }

  return (
    <section className={styles.librarySection} id="library" aria-labelledby="library-heading">
      <header className={styles.sectionHeading}>
        <div><p>02 / Find and review</p><h2 id="library-heading">Robin’s private library.</h2></div>
        <span>
          Search the server-held archive by person, media, and review state. Open any result without exposing the original publicly.
        </span>
      </header>

      <form className={styles.libraryTools} onSubmit={applyFilters}>
        <div className={styles.searchField}>
          <label htmlFor="library-search">Search titles, filenames, contributors, notes, or tags</label>
          <input
            id="library-search"
            type="search"
            value={draftFilters.query}
            onChange={(event) => setDraftFilters((current) => ({ ...current, query: event.target.value }))}
            placeholder="Search the private record…"
          />
        </div>
        <div>
          <label htmlFor="library-survivor">Survivor</label>
          <select id="library-survivor" value={draftFilters.survivor} onChange={(event) => setDraftFilters((current) => ({ ...current, survivor: event.target.value }))}>
            <option value="all">All dossiers</option>
            <option value="Sam Cohen">Sam Cohen</option>
            <option value="Stephan Jalnos">Stephan Jalnos</option>
            <option value="Shared research">Shared research</option>
            <option value="Unassigned intake">Unassigned</option>
          </select>
        </div>
        <div>
          <label htmlFor="library-type">Media</label>
          <select id="library-type" value={draftFilters.mediaType} onChange={(event) => setDraftFilters((current) => ({ ...current, mediaType: event.target.value as DemoArchiveFilters["mediaType"] }))}>
            <option value="all">All media</option>
            <option value="document">Documents</option>
            <option value="photograph">Photographs</option>
            <option value="audio">Audio</option>
            <option value="video">Video</option>
          </select>
        </div>
        <div>
          <label htmlFor="library-status">Review state</label>
          <select id="library-status" value={draftFilters.status} onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value as DemoArchiveFilters["status"] }))}>
            <option value="all">All private states</option>
            <option value="needs-review">Needs review</option>
            <option value="processing">Processing</option>
            <option value="ready">Ready</option>
            <option value="approved-private">Approved private</option>
          </select>
        </div>
        <button type="submit">Search archive</button>
      </form>

      <div className={styles.libraryLedger}>
        <header>
          <div>
            <p>Server-held private records</p>
            <h3>{status === "ready" && page ? `${page.total} record${page.total === 1 ? "" : "s"} found` : "Opening the ledger"}</h3>
          </div>
          {page && status === "ready" ? <span>Page {page.page} of {page.totalPages}</span> : null}
        </header>

        {status === "ready" && page?.limitations.length ? (
          <details className={styles.demoBoundary}>
            <summary>Live demo boundary</summary>
            <ul>{page.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
          </details>
        ) : null}

        {status === "loading" ? (
          <div className={styles.libraryLoading} role="status">
            <span>Reading the private catalog…</span><i /><i /><i />
          </div>
        ) : null}

        {status === "error" ? (
          <div className={styles.libraryError} role="alert">
            <p>{errorStatus === 401 ? "Archive sign-in required" : "Private library unavailable"}</p>
            <h3>{errorStatus === 401 ? "Sign in to open Robin’s encrypted private catalog." : "The intake desk is safe; the catalog connection needs another try."}</h3>
            <span>{error}</span>
            {errorStatus === 401 ? (
              <a href="/login?returnTo=/demo/robin/archive" target="_blank" rel="noopener">
                Sign in in a new tab
              </a>
            ) : null}
            <button type="button" onClick={() => setRetrySequence((sequence) => sequence + 1)}>Try the library again</button>
          </div>
        ) : null}

        {status === "ready" && page && page.items.length === 0 ? (
          <div className={styles.libraryEmpty}>
            <p>{filters.query || filters.survivor !== "all" || filters.mediaType !== "all" || filters.status !== "all" ? "No private records match this view" : "This private library is ready for its first original"}</p>
            <h3>{filters.query ? "Try a broader search or clear a filter." : "Add a batch above; saved originals will appear here from the server."}</h3>
            <a href="#intake">Go to private intake <span aria-hidden="true">↑</span></a>
          </div>
        ) : null}

        {status === "ready" && page?.items.length ? (
          <div className={styles.libraryRows}>
            {page.items.map((record) => (
              <article className={styles.libraryRow} key={record.id}>
                <span className={styles.recordIndex}>{typeIndex(record.mediaType)}</span>
                <div className={styles.recordTitle}>
                  <p>{record.survivorName}</p>
                  <h3>{record.title}</h3>
                  <span>{record.originalFilename} · {formatArchiveBytes(record.fileSize)}</span>
                </div>
                <dl>
                  <div><dt>Received</dt><dd>{formatArchiveDate(record.uploadedAt)}</dd></div>
                  <div><dt>Source</dt><dd>{record.sourceContributor}</dd></div>
                </dl>
                <span className={styles.recordStatus}>{statusLabel(record.status)}</span>
                <button type="button" onClick={() => setSelectedRecord(record)}>Open private record</button>
              </article>
            ))}
          </div>
        ) : null}

        {status === "ready" && page && page.totalPages > 1 ? (
          <nav className={styles.pagination} aria-label="Private library pages">
            <button type="button" disabled={page.page <= 1} onClick={() => changePage(page.page - 1)}>Previous</button>
            <span>Showing {(page.page - 1) * page.pageSize + 1}–{Math.min(page.page * page.pageSize, page.total)} of {page.total}</span>
            <button type="button" disabled={page.page >= page.totalPages} onClick={() => changePage(page.page + 1)}>Next</button>
          </nav>
        ) : null}
      </div>

      {selectedRecord ? (
        <RecordDialog
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
          onRecordUpdate={updatePrivateRecord}
        />
      ) : null}
    </section>
  );
}

function RecordDialog({
  record,
  onClose,
  onRecordUpdate,
}: {
  record: DemoArchiveRecord;
  onClose: () => void;
  onRecordUpdate: (
    recordId: string,
    update: Pick<DemoArchiveRecord, "scanStatus" | "previewUrl">,
  ) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reviewStatus, setReviewStatus] = useState<"idle" | "running" | "complete" | "error">("idle");
  const [reviewMessage, setReviewMessage] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  async function runLimitedTextReview() {
    if (reviewStatus === "running" || record.scanStatus !== "quarantined") return;
    setReviewStatus("running");
    setReviewMessage("");
    try {
      const result = await clearDemoArchiveText(record.id);
      onRecordUpdate(record.id, {
        scanStatus: result.record.scanStatus,
        previewUrl: result.record.previewUrl,
      });
      setReviewStatus("complete");
      setReviewMessage(
        result.status === "already-cleared"
          ? "This private text was already cleared."
          : "Limited text checks passed. The private original is now available to Robin and the Archive Assistant.",
      );
    } catch (caught) {
      setReviewStatus("error");
      setReviewMessage(
        caught instanceof Error
          ? caught.message
          : "The limited text safety review could not be completed.",
      );
    }
  }

  return (
    <dialog ref={dialogRef} className={styles.recordDialog} aria-labelledby="record-dialog-title" onClose={onClose}>
      <div className={styles.dialogTopbar}>
        <span>Private archive record · {record.id}</span>
        <button type="button" onClick={onClose} aria-label="Close private record">Close</button>
      </div>
      <div className={styles.dialogBody}>
        <RecordPreview record={record} />
        <article className={styles.recordDetails}>
          <p>{record.survivorName} · {mediaLabels[record.mediaType]}</p>
          <h2 id="record-dialog-title">{record.title}</h2>
          <span className={styles.recordStatus}>{statusLabel(record.status)}</span>
          <dl>
            <div><dt>Original file</dt><dd>{record.originalFilename}</dd></div>
            <div><dt>File size</dt><dd>{formatArchiveBytes(record.fileSize)}</dd></div>
            <div><dt>Source / contributor</dt><dd>{record.sourceContributor}</dd></div>
            <div><dt>Original language</dt><dd>{languageLabels[record.originalLanguage] ?? record.originalLanguage}</dd></div>
            <div><dt>Historical date</dt><dd>{record.historicalDate || "Not recorded"}</dd></div>
            <div><dt>Received</dt><dd>{formatArchiveDate(record.uploadedAt)}</dd></div>
            <div><dt>Rights basis</dt><dd>{consentLabels[record.consentRights] ?? record.consentRights}</dd></div>
            <div><dt>Visibility</dt><dd>Private · not published</dd></div>
            <div>
              <dt>Safety review</dt>
              <dd>
                {record.scanStatus === "cleared"
                  ? supportsLimitedTextReview(record)
                    ? "Limited text review cleared · not antivirus"
                    : "Safety clearance recorded"
                  : record.scanStatus === "blocked"
                    ? "Blocked by safety review"
                    : "Quarantined · preview locked"}
              </dd>
            </div>
            <div><dt>Archive processing</dt><dd>{archiveProcessLabel(record.extractionStatus)}</dd></div>
          </dl>
          <section>
            <h3>Rights and restrictions</h3>
            <p>{record.rightsStatement}</p>
          </section>
          {record.notes ? <section><h3>Context and handling notes</h3><p>{record.notes}</p></section> : null}
          {record.scanStatus === "quarantined" ? (
            <section className={styles.limitedTextReview} data-eligible={supportsLimitedTextReview(record) ? "true" : "false"}>
              <p className={styles.reviewEyebrow}>Separate private clearance</p>
              <h3>Limited text safety review</h3>
              {supportsLimitedTextReview(record) ? (
                <>
                  <p>
                    Robin can explicitly check this bounded UTF-8 .txt/.md original for file-family consistency, integrity, invalid UTF-8, NUL/control characters, and bidirectional controls. Passing unlocks only this private text for download and the Archive Assistant.
                  </p>
                  <strong>This is not antivirus. PDF, CSV, office, image, audio, and video files still require the production malware scanner.</strong>
                  <button type="button" disabled={reviewStatus === "running"} onClick={() => void runLimitedTextReview()}>
                    {reviewStatus === "running" ? "Running limited checks…" : "Run limited text safety review"}
                  </button>
                </>
              ) : (
                <p>
                  This format cannot use the limited text workflow. It stays quarantined until a separately governed production malware scanner clears it.
                </p>
              )}
              {reviewMessage ? (
                <p className={reviewStatus === "error" ? styles.reviewError : styles.reviewSuccess} role={reviewStatus === "error" ? "alert" : "status"}>
                  {reviewMessage}
                </p>
              ) : null}
            </section>
          ) : record.scanStatus === "cleared" && supportsLimitedTextReview(record) ? (
            <section className={styles.limitedTextReview} data-eligible="true">
              <p className={styles.reviewEyebrow}>Private text available</p>
              <h3>Limited text review cleared</h3>
              <p>This record can now ground Robin’s private Archive Assistant. The clearance was bounded to UTF-8 text and is not an antivirus result.</p>
              {reviewMessage ? <p className={styles.reviewSuccess} role="status">{reviewMessage}</p> : null}
            </section>
          ) : null}
          {record.tags.length ? <div className={styles.recordTags}>{record.tags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
          <div className={styles.dialogActions}>
            <Link href="/demo/robin/studio">Use in Survivor Studio</Link>
            <button type="button" disabled title="Publication review remains a separate curatorial decision">Publication review remains separate</button>
          </div>
        </article>
      </div>
    </dialog>
  );
}

function safePreviewUrl(value: string | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  if (value.startsWith("blob:") || value.startsWith("https://")) return value;
  return null;
}

function RecordPreview({ record }: { record: DemoArchiveRecord }) {
  const previewUrl = record.scanStatus === "cleared" ? safePreviewUrl(record.previewUrl) : null;
  if (record.mediaType === "photograph" && previewUrl) {
    return (
      <div
        className={styles.photoPreview}
        style={{ backgroundImage: `url(${JSON.stringify(previewUrl)})` }}
        role="img"
        aria-label={`Private preview of ${record.title}`}
      />
    );
  }
  if (record.mediaType === "audio" && previewUrl) {
    return <div className={styles.audioPreview}><span>AUDIO ORIGINAL</span><audio controls preload="metadata" src={previewUrl}>Audio preview is unavailable in this browser.</audio></div>;
  }
  if (record.mediaType === "video" && previewUrl) {
    return <div className={styles.videoPreview}><video controls preload="metadata" src={previewUrl}>Video preview is unavailable in this browser.</video></div>;
  }
  if (record.mediaType === "document") {
    return (
      <div className={styles.previewUnavailable}>
        <span>DOC</span>
        <h3>Document original</h3>
        <p>{previewUrl ? "This cleared document remains download-only; the browser does not render private originals inline." : "Documents remain quarantined and download-locked until their safety review clears."}</p>
        {previewUrl ? <a href={previewUrl} download={record.originalFilename}>Download cleared original</a> : null}
        <small>{record.mimeType}</small>
      </div>
    );
  }
  return (
    <div className={styles.previewUnavailable}>
      <span>{typeIndex(record.mediaType)}</span>
      <h3>{mediaLabels[record.mediaType]} original</h3>
      <p>{record.scanStatus === "quarantined" ? "This original remains quarantined until its safety review clears; browser preview is intentionally locked." : "A browser preview is not available for this private file. The original remains held by the server."}</p>
      <small>{record.mimeType}</small>
    </div>
  );
}
