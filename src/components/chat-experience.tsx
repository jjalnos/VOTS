"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import styles from "@/components/chat-experience.module.css";
import type { Locale } from "@/lib/domain/types";

const SESSION_LIMIT_MS = 10 * 60 * 1000;
const FIXED_REFUSAL = "I don’t have enough information about Susanne to answer that.";
export const GUIDE_VOICE_DISCLOSURE = {
  en: "The published testimony below is Susanne’s real voice, not AI. Interactive answers use OpenAI’s built-in “cedar” voice—configured for calm, resonant documentary delivery—and come from an AI archival guide, not Susanne and not a clone of her voice.",
  es: "El testimonio publicado que aparece abajo es la voz real de Susanne, no IA. Las respuestas interactivas usan la voz integrada «cedar» de OpenAI, configurada con una narración documental serena y resonante, y provienen de una guía de archivo con IA: no son Susanne ni un clon de su voz.",
} as const;

type ConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "listening"
  | "retrieving"
  | "responding"
  | "speaking"
  | "mic-denied"
  | "ended"
  | "error";

type InputMode = "microphone" | "text";
type UnknownRecord = Record<string, unknown>;

class PrivateRoomStartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrivateRoomStartError";
  }
}

interface CaptionLine {
  id: string;
  role: "user" | "guide";
  text: string;
  complete: boolean;
}

interface SourceCard {
  id: string;
  title: string;
  url: string;
  text?: string;
  timestampLabel?: string;
  timestampSeconds?: number;
  citationLabel?: string;
  score?: number;
  kind?: string;
}

interface NormalizedSearchResult {
  grounded: boolean;
  refusal: string;
  cards: SourceCard[];
  raw: UnknownRecord;
}

export interface RealtimeFunctionCall {
  callId: string;
  name: string;
  arguments: string;
  responseId?: string;
}

export interface RealtimeGeneration {
  session: number;
  turn: number;
}

export function realtimeGenerationIsCurrent(
  expected: RealtimeGeneration,
  current: RealtimeGeneration,
  aborted: boolean,
  mounted: boolean,
): boolean {
  return mounted
    && !aborted
    && expected.session === current.session
    && expected.turn === current.turn;
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function safeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function functionCallFromItem(
  value: unknown,
  responseId?: string,
): RealtimeFunctionCall | null {
  if (!isRecord(value) || value.type !== "function_call") return null;
  const callId = stringValue(value.call_id);
  const name = stringValue(value.name);
  if (!callId || !name) return null;
  return {
    callId,
    name,
    arguments: typeof value.arguments === "string" ? value.arguments : "{}",
    ...(responseId ? { responseId } : {}),
  };
}

/** Extracts tool calls from each Realtime event shape used by the GA API. */
export function functionCallsFromRealtimeEvent(value: unknown): RealtimeFunctionCall[] {
  if (!isRecord(value)) return [];

  if (value.type === "response.function_call_arguments.done") {
    const callId = stringValue(value.call_id);
    const name = stringValue(value.name);
    if (!callId || !name) return [];
    return [{
      callId,
      name,
      arguments: typeof value.arguments === "string" ? value.arguments : "{}",
      ...(stringValue(value.response_id)
        ? { responseId: stringValue(value.response_id) }
        : {}),
    }];
  }

  if (value.type === "response.output_item.done") {
    const call = functionCallFromItem(value.item, stringValue(value.response_id));
    return call ? [call] : [];
  }

  if (value.type === "response.done" && isRecord(value.response)) {
    const output = Array.isArray(value.response.output) ? value.response.output : [];
    const responseId = stringValue(value.response.id);
    return output
      .map((item) => functionCallFromItem(item, responseId))
      .filter((call): call is RealtimeFunctionCall => Boolean(call));
  }

  return [];
}

/** Converts the search endpoint response into bounded, render-only cards. */
export function normalizeTestimonySearchResult(value: unknown): NormalizedSearchResult {
  const raw = isRecord(value) ? value : {};
  const passages = Array.isArray(raw.passages) ? raw.passages : [];
  const sources = Array.isArray(raw.sources) ? raw.sources : [];
  const cards: SourceCard[] = [];

  passages.forEach((passage, index) => {
    if (!isRecord(passage)) return;
    const url = safeHttpUrl(passage.sourceUrl);
    const title = stringValue(passage.sourceTitle);
    const text = stringValue(passage.text);
    if (!url || !title || !text) return;
    cards.push({
      id: stringValue(passage.id) ?? "passage-" + index,
      title,
      url,
      text,
      score: numberValue(passage.score),
      timestampSeconds: numberValue(passage.timestampSeconds),
      timestampLabel: stringValue(passage.timestampLabel),
      citationLabel: stringValue(passage.citationLabel),
    });
  });

  if (!cards.length) {
    sources.forEach((source, index) => {
      if (!isRecord(source)) return;
      const url = safeHttpUrl(source.url);
      const title = stringValue(source.title);
      if (!url || !title) return;
      cards.push({
        id: "source-" + index,
        title,
        url,
        kind: stringValue(source.kind),
      });
    });
  }

  return {
    grounded: raw.grounded === true,
    refusal: stringValue(raw.refusal) ?? FIXED_REFUSAL,
    cards,
    raw,
  };
}

function factOnlyPassageText(value: string): string {
  const lines = value.split(/\r?\n/);
  while (lines.length) {
    const line = lines[0]?.trim() ?? "";
    if (!line) {
      lines.shift();
      continue;
    }
    if (
      /^Susanne\b.*\btestimony passage at\b/iu.test(line)
      || /^Source:\s*https?:\/\//iu.test(line)
      || /^Transcript status:/iu.test(line)
    ) {
      lines.shift();
      continue;
    }
    break;
  }
  return lines.join("\n").trim().slice(0, 3_000);
}

/** Keeps rich provenance in the UI while withholding citation metadata from speech. */
export function modelFacingTestimonyResult(result: NormalizedSearchResult) {
  const passages = result.cards.flatMap((card) => {
    if (!card.text) return [];
    const text = factOnlyPassageText(card.text);
    return text ? [{ text, untrusted: true as const }] : [];
  }).slice(0, 6);

  return {
    grounded: result.grounded && passages.length > 0,
    quote_approved: false as const,
    passages,
    refusal: result.refusal,
  };
}

export function sourceHref(card: Pick<SourceCard, "url" | "timestampSeconds">): string {
  if (card.timestampSeconds === undefined) return card.url;
  try {
    const url = new URL(card.url);
    if (url.hostname === "youtu.be" || url.hostname.endsWith("youtube.com")) {
      url.searchParams.set("t", Math.max(0, Math.floor(card.timestampSeconds)) + "s");
      return url.toString();
    }
  } catch {
    // The server already supplies safe HTTP URLs. Retain it if a legacy
    // browser parses a valid URL differently.
  }
  return card.url;
}

function transcriptText(event: UnknownRecord): string | undefined {
  return stringValue(event.transcript) ?? stringValue(event.text);
}

function statusCopy(locale: Locale, state: ConnectionState, muted: boolean): string {
  const es = locale === "es";
  switch (state) {
    case "connecting":
      return es ? "Conectando la sala privada…" : "Connecting the private room…";
    case "connected":
      return muted
        ? (es ? "Conectado. El micrófono está silenciado." : "Connected. Your microphone is muted.")
        : (es ? "Conectado. La guía está lista." : "Connected. The guide is ready.");
    case "listening":
      return es ? "Escuchando…" : "Listening…";
    case "retrieving":
      return es
        ? "Buscando el testimonio antes de responder…"
        : "Searching the testimony before answering…";
    case "responding":
      return es
        ? "La guía está preparando una respuesta directa basada en hechos…"
        : "The guide is preparing a direct, fact-based answer…";
    case "speaking":
      return es
        ? "La guía de archivo con IA está hablando."
        : "The AI archival guide is speaking.";
    case "mic-denied":
      return es
        ? "No se permitió el micrófono. Puede continuar solo con texto."
        : "Microphone access was not allowed. You can continue with text only.";
    case "ended":
      return es
        ? "La conversación terminó y se borró de esta página."
        : "The conversation ended and was cleared from this page.";
    case "error":
      return es
        ? "La conexión terminó. Puede intentarlo de nuevo."
        : "The connection ended. You can try again.";
    default:
      return es
        ? "La conversación privada no ha comenzado."
        : "The private conversation has not started.";
  }
}

function startButtonCopy(locale: Locale, state: ConnectionState): string {
  if (locale === "es") {
    return state === "error" || state === "ended" || state === "mic-denied"
      ? "Intentar de nuevo con micrófono"
      : "Iniciar conversación";
  }
  return state === "error" || state === "ended" || state === "mic-denied"
    ? "Try microphone again"
    : "Start conversation";
}

export function ChatExperience({ locale }: { locale: Locale }) {
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [inputMode, setInputMode] = useState<InputMode | null>(null);
  const [muted, setMuted] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [question, setQuestion] = useState("");
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [captions, setCaptions] = useState<CaptionLine[]>([]);
  const [sourceCards, setSourceCards] = useState<SourceCard[]>([]);
  const [grounded, setGrounded] = useState<boolean | null>(null);
  const [refusal, setRefusal] = useState(FIXED_REFUSAL);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<{ id: number; text: string } | null>(null);

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const questionRef = useRef<HTMLTextAreaElement | null>(null);
  const startButtonRef = useRef<HTMLButtonElement | null>(null);
  const textOnlyButtonRef = useRef<HTMLButtonElement | null>(null);
  const sessionAbortRef = useRef<AbortController | null>(null);
  const testimonySearchAbortRef = useRef<AbortController | null>(null);
  const sessionTimerRef = useRef<number | null>(null);
  const startLockRef = useRef(false);
  const intentionalCloseRef = useRef(false);
  const mountedRef = useRef(true);
  const handledCallIdsRef = useRef(new Set<string>());
  const generatedCaptionIdRef = useRef(0);
  const currentUserCaptionIdRef = useRef<string | null>(null);
  const currentGuideCaptionIdRef = useRef<string | null>(null);
  const sessionGenerationRef = useRef(0);
  const turnGenerationRef = useRef(0);
  const responseGenerationsRef = useRef(new Map<string, RealtimeGeneration>());
  const callGenerationsRef = useRef(new Map<string, RealtimeGeneration>());
  const pendingResponseGenerationsRef = useRef<RealtimeGeneration[]>([]);
  const remoteAudioSessionGenerationRef = useRef<number | null>(null);
  const announcementIdRef = useRef(0);

  const activeStates: ConnectionState[] = [
    "connecting",
    "connected",
    "listening",
    "retrieving",
    "responding",
    "speaking",
  ];
  const isActive = activeStates.includes(connectionState);
  const conversationReady = isActive && connectionState !== "connecting";
  const es = locale === "es";

  const announce = useCallback((text: string) => {
    setAnnouncement({ id: ++announcementIdRef.current, text });
  }, []);

  const generationIsActive = useCallback((
    expected: RealtimeGeneration,
    signal?: AbortSignal,
  ): boolean => realtimeGenerationIsCurrent(
    expected,
    {
      session: sessionGenerationRef.current,
      turn: turnGenerationRef.current,
    },
    signal?.aborted ?? false,
    mountedRef.current,
  ), []);

  const beginNewTurn = useCallback((): RealtimeGeneration => {
    testimonySearchAbortRef.current?.abort();
    testimonySearchAbortRef.current = null;
    // A cancelled response is not guaranteed to emit response.created. Never
    // let its unconsumed queue entry become the generation for the next turn.
    pendingResponseGenerationsRef.current = [];
    responseGenerationsRef.current.clear();
    callGenerationsRef.current.clear();
    turnGenerationRef.current += 1;
    currentGuideCaptionIdRef.current = null;
    return {
      session: sessionGenerationRef.current,
      turn: turnGenerationRef.current,
    };
  }, []);

  const updateCaption = useCallback((
    id: string,
    role: CaptionLine["role"],
    value: string,
    options: { complete?: boolean; replace?: boolean } = {},
  ) => {
    setCaptions((current) => {
      const index = current.findIndex((line) => line.id === id && line.role === role);
      let next: CaptionLine[];
      if (index === -1) {
        next = [...current, {
          id,
          role,
          text: value,
          complete: options.complete ?? false,
        }];
      } else {
        next = [...current];
        const existing = next[index];
        next[index] = {
          ...existing,
          text: options.replace ? value : existing.text + value,
          complete: options.complete ?? existing.complete,
        };
      }
      return next.slice(-20);
    });
  }, []);

  const clearVisibleSession = useCallback(() => {
    setCaptions([]);
    setSourceCards([]);
    setGrounded(null);
    setRefusal(FIXED_REFUSAL);
    setQuestion("");
    setQuestionError(null);
    setErrorMessage(null);
    setAnnouncement(null);
    currentUserCaptionIdRef.current = null;
    currentGuideCaptionIdRef.current = null;
  }, []);

  const cleanupTransport = useCallback(() => {
    intentionalCloseRef.current = true;
    sessionGenerationRef.current += 1;
    turnGenerationRef.current += 1;
    testimonySearchAbortRef.current?.abort();
    testimonySearchAbortRef.current = null;
    responseGenerationsRef.current.clear();
    callGenerationsRef.current.clear();
    pendingResponseGenerationsRef.current = [];
    remoteAudioSessionGenerationRef.current = null;
    if (sessionTimerRef.current !== null) {
      window.clearTimeout(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
    sessionAbortRef.current?.abort();
    sessionAbortRef.current = null;

    const channel = channelRef.current;
    channelRef.current = null;
    if (channel) {
      channel.onopen = null;
      channel.onclose = null;
      channel.onerror = null;
      channel.onmessage = null;
      if (channel.readyState !== "closed") channel.close();
    }

    const peer = peerRef.current;
    peerRef.current = null;
    if (peer) {
      peer.ontrack = null;
      peer.onconnectionstatechange = null;
      if (peer.connectionState !== "closed") peer.close();
    }

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;

    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current.removeAttribute("src");
    }

    handledCallIdsRef.current.clear();
    startLockRef.current = false;
  }, []);

  const endConversation = useCallback((reason: "ended" | "timeout" = "ended") => {
    cleanupTransport();
    clearVisibleSession();
    if (!mountedRef.current) return;
    setMuted(false);
    setAudioBlocked(false);
    setInputMode(null);
    setConnectionState("ended");
    if (reason === "timeout") {
      setErrorMessage(es
        ? "La sesión alcanzó el límite privado de 10 minutos y se cerró."
        : "The session reached its 10-minute private limit and was closed.");
    }
    window.requestAnimationFrame(() => startButtonRef.current?.focus());
  }, [cleanupTransport, clearVisibleSession, es]);

  const sendRealtimeEvent = useCallback((
    event: UnknownRecord,
    expected?: RealtimeGeneration,
    signal?: AbortSignal,
  ): boolean => {
    if (expected && !generationIsActive(expected, signal)) return false;
    const channel = channelRef.current;
    if (!channel || channel.readyState !== "open") return false;
    channel.send(JSON.stringify(event));
    return true;
  }, [generationIsActive]);

  const requestRealtimeResponse = useCallback((
    expected: RealtimeGeneration,
    response?: UnknownRecord,
    signal?: AbortSignal,
  ): boolean => {
    if (!generationIsActive(expected, signal)) return false;
    const queued = { ...expected };
    pendingResponseGenerationsRef.current.push(queued);
    const sent = sendRealtimeEvent({
      type: "response.create",
      ...(response ? { response } : {}),
    }, expected, signal);
    if (!sent) {
      const index = pendingResponseGenerationsRef.current.lastIndexOf(queued);
      if (index !== -1) pendingResponseGenerationsRef.current.splice(index, 1);
    }
    return sent;
  }, [generationIsActive, sendRealtimeEvent]);

  const runTestimonySearch = useCallback(async (
    call: RealtimeFunctionCall,
    expected: RealtimeGeneration,
  ) => {
    if (!generationIsActive(expected)) return;
    if (handledCallIdsRef.current.has(call.callId)) return;
    handledCallIdsRef.current.add(call.callId);

    if (call.name !== "search_testimony") {
      const outputSent = sendRealtimeEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: call.callId,
          output: JSON.stringify({
            grounded: false,
            quote_approved: false,
            refusal: FIXED_REFUSAL,
          }),
        },
      }, expected);
      if (outputSent) {
        requestRealtimeResponse(expected, { tool_choice: "none" });
      }
      return;
    }

    testimonySearchAbortRef.current?.abort();
    const controller = new AbortController();
    testimonySearchAbortRef.current = controller;
    const stillCurrent = () => (
      testimonySearchAbortRef.current === controller
      && generationIsActive(expected, controller.signal)
    );

    if (!stillCurrent()) return;
    setConnectionState("retrieving");
    setErrorMessage(null);
    let query = "";
    try {
      const parsed = JSON.parse(call.arguments) as unknown;
      if (isRecord(parsed) && typeof parsed.query === "string") {
        query = parsed.query.trim();
      }
    } catch {
      query = "";
    }

    let result: NormalizedSearchResult;
    try {
      if (query.length < 2 || query.length > 600) throw new Error("invalid-query");
      const response = await fetch("/api/testimony/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });
      if (!stillCurrent()) return;
      const payload = await response.json() as unknown;
      if (!stillCurrent()) return;
      if (!response.ok) throw new Error("search-failed");
      result = normalizeTestimonySearchResult(payload);
    } catch (error) {
      const wasAborted = controller.signal.aborted
        || (error instanceof DOMException && error.name === "AbortError");
      if (wasAborted || !stillCurrent()) return;
      result = normalizeTestimonySearchResult({
        grounded: false,
        passages: [],
        sources: [],
        quote_approved: false,
        refusal: FIXED_REFUSAL,
      });
      setErrorMessage(es
        ? "La búsqueda del testimonio no está disponible. La guía no responderá sin respaldo."
        : "Testimony search is unavailable. The guide will not answer without support.");
    }

    if (!stillCurrent()) return;
    setSourceCards(result.cards);
    setGrounded(result.grounded);
    setRefusal(result.refusal);
    const optionalSourceAnnouncement = result.cards.length > 0
      ? (es
        ? " Los detalles opcionales de la fuente están disponibles debajo."
        : " Optional source details are available below.")
      : "";
    announce((result.grounded && result.cards.length
      ? (es
        ? "La guía tiene suficiente respaldo para responder."
        : "The guide has enough support to answer.")
      : (es
        ? "No hay suficiente información para responder."
        : "There is not enough information to answer.")) + optionalSourceAnnouncement);

    if (!stillCurrent()) return;
    const outputSent = sendRealtimeEvent({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: call.callId,
        output: JSON.stringify(modelFacingTestimonyResult(result)),
      },
    }, expected, controller.signal);
    if (!outputSent || !stillCurrent()) return;
    if (!requestRealtimeResponse(
      expected,
      { tool_choice: "none" },
      controller.signal,
    )) return;
    if (!stillCurrent()) return;
    setConnectionState("responding");
    if (testimonySearchAbortRef.current === controller) {
      testimonySearchAbortRef.current = null;
    }
  }, [
    announce,
    es,
    generationIsActive,
    requestRealtimeResponse,
    sendRealtimeEvent,
  ]);

  const handleRealtimeEvent = useCallback(async (
    rawData: string,
    sessionGeneration: number,
  ) => {
    if (!mountedRef.current || sessionGenerationRef.current !== sessionGeneration) {
      return;
    }
    let event: UnknownRecord;
    try {
      const parsed = JSON.parse(rawData) as unknown;
      if (!isRecord(parsed)) return;
      event = parsed;
    } catch {
      return;
    }

    const type = stringValue(event.type);
    if (!type) return;

    if (type === "response.created" && isRecord(event.response)) {
      const responseId = stringValue(event.response.id);
      const queued = pendingResponseGenerationsRef.current.shift();
      if (responseId && queued && queued.session === sessionGeneration) {
        responseGenerationsRef.current.set(responseId, queued);
      }
    }

    const responseId = stringValue(event.response_id)
      ?? (isRecord(event.response) ? stringValue(event.response.id) : undefined);
    const responseGeneration = responseId
      ? responseGenerationsRef.current.get(responseId)
      : undefined;
    const responseEventIsCurrent = !responseId
      || Boolean(responseGeneration && generationIsActive(responseGeneration));

    if (
      responseId
      && responseGeneration
      && (type === "response.output_item.added" || type === "response.output_item.done")
      && isRecord(event.item)
    ) {
      const callId = stringValue(event.item.call_id);
      if (callId) callGenerationsRef.current.set(callId, responseGeneration);
    }

    if (type === "input_audio_buffer.speech_started") {
      beginNewTurn();
      const id = stringValue(event.item_id)
        ?? "user-" + (++generatedCaptionIdRef.current);
      currentUserCaptionIdRef.current = id;
      updateCaption(id, "user", "");
      setSourceCards([]);
      setGrounded(null);
      setConnectionState("listening");
    } else if (type === "input_audio_buffer.speech_stopped") {
      pendingResponseGenerationsRef.current.push({
        session: sessionGenerationRef.current,
        turn: turnGenerationRef.current,
      });
      setConnectionState("responding");
    } else if (
      type === "conversation.item.input_audio_transcription.delta"
      && sessionGenerationRef.current === sessionGeneration
    ) {
      const delta = typeof event.delta === "string" ? event.delta : undefined;
      const id = stringValue(event.item_id) ?? currentUserCaptionIdRef.current;
      if (delta && id) updateCaption(id, "user", delta);
    } else if (
      type === "conversation.item.input_audio_transcription.completed"
      && sessionGenerationRef.current === sessionGeneration
    ) {
      const transcript = transcriptText(event);
      const id = stringValue(event.item_id) ?? currentUserCaptionIdRef.current;
      if (transcript && id) {
        updateCaption(id, "user", transcript, { complete: true, replace: true });
        announce(es
          ? "Se completaron los subtítulos de su pregunta."
          : "Captions for your question are complete.");
      }
      currentUserCaptionIdRef.current = null;
    } else if (
      (type === "response.output_audio_transcript.delta"
        || type === "response.output_text.delta")
      && responseEventIsCurrent
    ) {
      const delta = typeof event.delta === "string" ? event.delta : undefined;
      let id = stringValue(event.item_id) ?? currentGuideCaptionIdRef.current;
      if (!id) {
        id = "guide-" + (++generatedCaptionIdRef.current);
        currentGuideCaptionIdRef.current = id;
      }
      if (delta) updateCaption(id, "guide", delta);
    } else if (
      (type === "response.output_audio_transcript.done"
        || type === "response.output_text.done")
      && responseEventIsCurrent
    ) {
      const transcript = transcriptText(event);
      const id = stringValue(event.item_id) ?? currentGuideCaptionIdRef.current;
      if (transcript && id) {
        updateCaption(id, "guide", transcript, { complete: true, replace: true });
        announce(es
          ? "Se completaron los subtítulos de la respuesta de la guía."
          : "Captions for the guide answer are complete.");
      }
      currentGuideCaptionIdRef.current = null;
    } else if (
      (type === "output_audio_buffer.started" || type === "response.output_audio.started")
      && responseEventIsCurrent
    ) {
      setConnectionState("speaking");
    } else if (
      (type === "output_audio_buffer.stopped" || type === "response.output_audio.done")
      && responseEventIsCurrent
    ) {
      setConnectionState("connected");
    } else if (type === "error") {
      const apiError = isRecord(event.error)
        ? stringValue(event.error.message)
        : undefined;
      setErrorMessage(apiError ?? (es
        ? "La guía encontró un error."
        : "The guide encountered an error."));
    }

    const calls = functionCallsFromRealtimeEvent(event);
    for (const call of calls) {
      const expected = (call.responseId
        ? responseGenerationsRef.current.get(call.responseId)
        : undefined)
        ?? callGenerationsRef.current.get(call.callId);
      if (!expected || !generationIsActive(expected)) continue;
      await runTestimonySearch(call, expected);
    }

  }, [
    announce,
    beginNewTurn,
    es,
    generationIsActive,
    runTestimonySearch,
    updateCaption,
  ]);

  const startConversation = useCallback(async (mode: InputMode) => {
    if (startLockRef.current || isActive) return;
    cleanupTransport();
    const sessionGeneration = ++sessionGenerationRef.current;
    const sessionIsCurrent = () => (
      mountedRef.current && sessionGenerationRef.current === sessionGeneration
    );
    startLockRef.current = true;
    clearVisibleSession();
    intentionalCloseRef.current = false;
    setMuted(false);
    setAudioBlocked(false);
    setConnectionState("connecting");
    setInputMode(mode);

    try {
      let localStream: MediaStream | null = null;
      if (mode === "microphone") {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new DOMException("Microphone unavailable", "NotFoundError");
        }
        try {
          localStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: false,
          });
        } catch (error) {
          if (!sessionIsCurrent()) return;
          if (
            error instanceof DOMException
            && (error.name === "NotAllowedError" || error.name === "NotFoundError")
          ) {
            cleanupTransport();
            if (mountedRef.current) {
              setInputMode(null);
              setConnectionState("mic-denied");
              setErrorMessage(es
                ? "No se guardó audio. Permita el micrófono o continúe solo con texto."
                : "No audio was saved. Allow microphone access or continue with text only.");
              window.requestAnimationFrame(() => textOnlyButtonRef.current?.focus());
            }
            return;
          }
          throw error;
        }
      }

      if (!sessionIsCurrent()) {
        localStream?.getTracks().forEach((track) => track.stop());
        return;
      }

      localStreamRef.current = localStream;
      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      if (localStream) {
        localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));
      } else {
        peer.addTransceiver("audio", { direction: "recvonly" });
      }

      peer.ontrack = (event) => {
        if (!sessionIsCurrent()) return;
        const [stream] = event.streams;
        if (!remoteAudioRef.current || !stream) return;
        remoteAudioSessionGenerationRef.current = sessionGeneration;
        remoteAudioRef.current.srcObject = stream;
        void remoteAudioRef.current.play().then(() => {
          if (sessionIsCurrent()) setAudioBlocked(false);
        }).catch(() => {
          if (sessionIsCurrent()) {
            setAudioBlocked(true);
            setErrorMessage(es
              ? "El navegador pausó el audio de la guía. Use el control «Reproducir audio»."
              : "Your browser paused the guide audio. Use the Play guide audio control.");
          }
        });
      };

      peer.onconnectionstatechange = () => {
        if (intentionalCloseRef.current || !sessionIsCurrent()) return;
        if (
          peer.connectionState === "failed"
          || peer.connectionState === "disconnected"
          || peer.connectionState === "closed"
        ) {
          cleanupTransport();
          if (mountedRef.current) {
            setMuted(false);
            setAudioBlocked(false);
            setInputMode(null);
            setConnectionState("error");
            setErrorMessage(es
              ? "La conexión privada se cerró. Puede volver a intentarlo."
              : "The private connection closed. You can start again.");
          }
        }
      };

      const channel = peer.createDataChannel("oai-events");
      channelRef.current = channel;
      channel.onopen = () => {
        if (!sessionIsCurrent()) return;
        setConnectionState("connected");
        if (mode === "text") {
          window.requestAnimationFrame(() => {
            if (sessionIsCurrent()) questionRef.current?.focus();
          });
        }
        sessionTimerRef.current = window.setTimeout(
          () => endConversation("timeout"),
          SESSION_LIMIT_MS,
        );
      };
      channel.onmessage = (message) => {
        if (typeof message.data === "string" && sessionIsCurrent()) {
          void handleRealtimeEvent(message.data, sessionGeneration);
        }
      };
      channel.onerror = () => {
        if (sessionIsCurrent()) {
          setErrorMessage(es
            ? "El canal de conversación encontró un error."
            : "The conversation channel encountered an error.");
        }
      };
      channel.onclose = () => {
        if (intentionalCloseRef.current || !sessionIsCurrent()) return;
        cleanupTransport();
        setMuted(false);
        setAudioBlocked(false);
        setInputMode(null);
        setConnectionState("error");
        setErrorMessage(es
          ? "El canal privado se cerró."
          : "The private channel closed.");
      };

      const offer = await peer.createOffer();
      if (!sessionIsCurrent()) return;
      await peer.setLocalDescription(offer);
      if (!sessionIsCurrent()) return;
      if (!peer.localDescription?.sdp) throw new Error("missing-offer");

      const controller = new AbortController();
      sessionAbortRef.current = controller;
      const response = await fetch("/api/realtime/session", {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: peer.localDescription.sdp,
        signal: controller.signal,
      });
      if (!sessionIsCurrent()) return;
      if (sessionAbortRef.current === controller) sessionAbortRef.current = null;
      const answer = await response.text();
      if (!sessionIsCurrent()) return;
      if (!response.ok) {
        let safeServerMessage: string | undefined;
        try {
          const payload = JSON.parse(answer) as unknown;
          if (isRecord(payload)) safeServerMessage = stringValue(payload.error);
        } catch {
          safeServerMessage = undefined;
        }
        throw new PrivateRoomStartError(
          safeServerMessage
            ?? (es
              ? "No se pudo iniciar el servicio privado de conversación."
              : "The private conversation service could not start."),
        );
      }
      await peer.setRemoteDescription({ type: "answer", sdp: answer });
      if (!sessionIsCurrent()) return;
      startLockRef.current = false;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (!sessionIsCurrent()) return;
      cleanupTransport();
      if (mountedRef.current) {
        setMuted(false);
        setAudioBlocked(false);
        setInputMode(null);
        setConnectionState("error");
        setErrorMessage(error instanceof PrivateRoomStartError
          ? error.message
          : (es
            ? "No se pudo iniciar la sala privada. Actualice la página, confirme su sesión e inténtelo de nuevo."
            : "The private room could not start. Refresh, confirm your sign-in, and try again."));
      }
    }
  }, [
    cleanupTransport,
    clearVisibleSession,
    endConversation,
    es,
    handleRealtimeEvent,
    isActive,
  ]);

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const nextMuted = !muted;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setMuted(nextMuted);
  }, [muted]);

  const playGuideAudio = useCallback(() => {
    if (!remoteAudioRef.current) return;
    void remoteAudioRef.current.play().then(() => {
      setAudioBlocked(false);
      setErrorMessage(null);
    }).catch(() => {
      setAudioBlocked(true);
    });
  }, []);

  const submitText = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = question.trim();
    if (trimmed.length < 2) {
      setQuestionError(es
        ? "Escriba al menos dos caracteres que no sean espacios."
        : "Enter at least two characters other than spaces.");
      window.requestAnimationFrame(() => questionRef.current?.focus());
      return;
    }
    setQuestionError(null);
    if (channelRef.current?.readyState !== "open") {
      setErrorMessage(es
        ? "Inicie la conversación privada, con micrófono o solo texto, antes de enviar una pregunta."
        : "Start the private conversation, with microphone or text only, before sending a question.");
      return;
    }

    const expected = beginNewTurn();
    setErrorMessage(null);
    setSourceCards([]);
    setGrounded(null);
    const id = "typed-" + Date.now() + "-" + (++generatedCaptionIdRef.current);
    updateCaption(id, "user", trimmed, { complete: true, replace: true });
    const itemSent = sendRealtimeEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: trimmed }],
      },
    }, expected);
    if (!itemSent || !requestRealtimeResponse(expected)) return;
    setQuestion("");
    setConnectionState("responding");
  }, [
    beginNewTurn,
    es,
    question,
    requestRealtimeResponse,
    sendRealtimeEvent,
    updateCaption,
  ]);

  useEffect(() => {
    mountedRef.current = true;
    const closeForNavigation = () => {
      cleanupTransport();
      clearVisibleSession();
      setMuted(false);
      setAudioBlocked(false);
      setInputMode(null);
      setConnectionState("ended");
    };
    window.addEventListener("pagehide", closeForNavigation);
    return () => {
      mountedRef.current = false;
      window.removeEventListener("pagehide", closeForNavigation);
      cleanupTransport();
    };
  }, [cleanupTransport, clearVisibleSession]);

  const stateCopy = statusCopy(locale, connectionState, muted);
  const guideSpeaking = connectionState === "speaking";

  return (
    <section className={styles.room} aria-labelledby="private-listening-room">
      <div className={styles.frame}>
        <aside className={styles.identityPanel} aria-labelledby="susanne-name">
          <figure className={styles.portrait}>
            <Image
              src="/susanne-jalnos-portrait.jpg"
              alt={es
                ? "Retrato de Susanne Weisz Jalnos procedente de un anuncio del Museo Conmemorativo del Holocausto de San Antonio"
                : "Portrait of Susanne Weisz Jalnos from a Holocaust Memorial Museum of San Antonio announcement"}
              width={760}
              height={957}
              priority
            />
            <figcaption>
              {es
                ? "Retrato publicado en un anuncio de la serie Survivor Speakers de HMMSA. La imagen permanece inmóvil."
                : "Portrait published in an HMMSA Survivor Speakers Series announcement. The image remains still."}
            </figcaption>
          </figure>
          <p className={styles.kicker}>
            {es ? "Archivo familiar privado" : "Private family archive"}
          </p>
          <h2 id="susanne-name">Susanne “Zsuzsi” Weisz Jalnos</h2>
          <div
            className={[
              styles.voiceActivity,
              guideSpeaking ? styles.voiceActivityActive : "",
            ].filter(Boolean).join(" ")}
            role="img"
            aria-label={guideSpeaking
              ? (es
                ? "El audio de la guía de archivo con IA está activo"
                : "AI archival-guide audio is active")
              : (es
                ? "El audio de la guía está inactivo"
                : "Archival-guide audio is inactive")}
          >
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <small>
              {es ? "Actividad de audio de la guía" : "Guide audio activity"}
            </small>
          </div>
        </aside>

        <div className={styles.conversationPanel}>
          <div className={styles.disclosure} role="note">
            <strong>
              {es
                ? "Dos tipos de audio, siempre identificados"
                : "Two kinds of audio, always identified"}
            </strong>
            <p>
              {es
                ? GUIDE_VOICE_DISCLOSURE.es
                : GUIDE_VOICE_DISCLOSURE.en}
            </p>
          </div>

          <div className={styles.conversationHeading}>
            <div>
              <p className={styles.kicker}>
                {es ? "Guía directa y factual" : "Fact-first archival guide"}
              </p>
              <h2 id="private-listening-room">
                {es
                  ? "Conversar con la guía de archivo"
                  : "Talk with the archival guide"}
              </h2>
            </div>
            <div className={styles.sessionLimit}>
              {es ? "Sesión máxima: 10 min" : "10-minute session limit"}
            </div>
          </div>

          <div
            className={styles.status}
            aria-live="polite"
            aria-atomic="true"
            role="status"
          >
            <span
              className={styles.statusDot}
              data-active={isActive || undefined}
              aria-hidden="true"
            />
            <span>{stateCopy}</span>
          </div>
          <div
            className={styles.visuallyHidden}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {announcement
              ? <span key={announcement.id}>{announcement.text}</span>
              : null}
          </div>
          {errorMessage
            ? <p className={styles.error} role="alert">{errorMessage}</p>
            : null}

          <div
            className={styles.controls}
            role="group"
            aria-label={es ? "Controles de conversación" : "Conversation controls"}
          >
            <button
              ref={startButtonRef}
              className="button"
              type="button"
              onClick={() => void startConversation("microphone")}
              disabled={isActive}
            >
              {connectionState === "connecting"
                ? (es ? "Conectando…" : "Connecting…")
                : startButtonCopy(locale, connectionState)}
            </button>
            {!isActive
              ? (
                <button
                  ref={textOnlyButtonRef}
                  className="button secondary"
                  type="button"
                  onClick={() => void startConversation("text")}
                >
                  {connectionState === "mic-denied"
                    ? (es ? "Continuar solo con texto" : "Continue with text only")
                    : (es ? "Iniciar solo con texto" : "Start text only")}
                </button>
              )
              : null}
            <button
              className="button secondary"
              type="button"
              onClick={toggleMute}
              disabled={!isActive || inputMode !== "microphone"}
            >
              {muted
                ? (es ? "Activar micrófono" : "Unmute microphone")
                : (es ? "Silenciar micrófono" : "Mute microphone")}
            </button>
            {audioBlocked
              ? (
                <button
                  className="button secondary"
                  type="button"
                  onClick={playGuideAudio}
                >
                  {es ? "Reproducir audio" : "Play guide audio"}
                </button>
              )
              : null}
            <button
              className="button secondary"
              type="button"
              onClick={() => endConversation("ended")}
              disabled={!isActive}
            >
              {es ? "Terminar" : "End"}
            </button>
          </div>

          <audio
            ref={remoteAudioRef}
            className={styles.remoteAudio}
            autoPlay
            aria-hidden="true"
            onPlay={() => {
              if (
                remoteAudioSessionGenerationRef.current
                === sessionGenerationRef.current
              ) setAudioBlocked(false);
            }}
            onPlaying={() => {
              if (
                remoteAudioSessionGenerationRef.current
                === sessionGenerationRef.current
              ) setAudioBlocked(false);
            }}
          />

          <form className={styles.textForm} onSubmit={submitText} noValidate>
            <label htmlFor="archival-guide-question">
              {es ? "Pregunta por texto" : "Written question"}
            </label>
            <textarea
              ref={questionRef}
              id="archival-guide-question"
              value={question}
              onChange={(event) => {
                setQuestion(event.target.value);
                if (questionError) setQuestionError(null);
              }}
              minLength={2}
              maxLength={600}
              required
              placeholder={es
                ? "Pregunte sobre la vida y las experiencias de Susanne…"
                : "Ask about Susanne’s life and experiences…"}
              aria-invalid={questionError ? true : undefined}
              aria-describedby={questionError
                ? "text-question-help text-question-error"
                : "text-question-help"}
            />
            {questionError
              ? (
                <p id="text-question-error" className={styles.fieldError} role="alert">
                  {questionError}
                </p>
              )
              : null}
            <div className={styles.formFooter}>
              <p id="text-question-help">
                {conversationReady
                  ? (es
                    ? "La guía responderá directamente con hechos respaldados."
                    : "The guide will answer directly with supported facts.")
                  : (es
                    ? "Primero inicie la conversación privada; aquí no se usa el chat público de demostración."
                    : "Start the private conversation first; this does not use the public mock chat.")}
              </p>
              <button className="button" type="submit">
                {es ? "Enviar" : "Send"}
              </button>
            </div>
          </form>

          <section
            className={styles.captions}
            aria-labelledby="live-captions-title"
          >
            <div className={styles.sectionTitleRow}>
              <h3 id="live-captions-title">
                {es ? "Subtítulos en vivo" : "Live captions"}
              </h3>
              <span>{es ? "Solo esta sesión" : "This session only"}</span>
            </div>
            {captions.length
              ? (
                <ol>
                  {captions.map((line) => (
                    <li key={line.role + "-" + line.id} data-role={line.role}>
                      <strong>
                        {line.role === "user"
                          ? (es ? "Usted" : "You")
                          : (es
                            ? "Guía de archivo con IA"
                            : "AI archival guide")}
                      </strong>
                      <p>
                        {line.text || (line.complete
                          ? "…"
                          : (es ? "Escuchando…" : "Listening…"))}
                      </p>
                    </li>
                  ))}
                </ol>
              )
              : (
                <p className={styles.emptyState}>
                  {es
                    ? "Los subtítulos aparecerán aquí al comenzar."
                    : "Captions will appear here after you begin."}
                </p>
              )}
          </section>

          {grounded === false
            ? (
              <p
                className={styles.refusal}
                role="status"
                lang={es ? "en" : undefined}
              >
                {refusal}
              </p>
            )
            : null}
          {sourceCards.length
            ? (
              <details
                className={styles.sources}
              >
                <summary>
                  {es ? "Detalles de la fuente (opcional)" : "Source details (optional)"}
                </summary>
                <div className={styles.sectionTitleRow}>
                  <h3 id="source-cards-title">
                    {es ? "Fuentes consultadas" : "Sources consulted"}
                  </h3>
                  <span>
                    {grounded
                      ? (es ? "Respaldo encontrado" : "Support found")
                      : (es ? "Fuente original" : "Original source")}
                  </span>
                </div>
                <p className={styles.transcriptNotice}>
                  {es
                    ? "Los pasajes son de una transcripción de YouTube generada por IA y aún no revisada. Ayudan a localizar el material, pero no están aprobados como citas exactas."
                    : "Passages come from an unreviewed, AI-generated YouTube transcript. They help locate the material but are not approved as exact quotations."}
                </p>
                <ol>
                  {sourceCards.map((card) => (
                    <li key={card.id}>
                      <p className={styles.sourceMeta}>
                        {card.citationLabel
                          ?? card.timestampLabel
                          ?? card.kind
                          ?? (es ? "Testimonio" : "Testimony")}
                        {card.score !== undefined
                          ? " · "
                            + Math.round(Math.max(0, Math.min(1, card.score)) * 100)
                            + "% "
                            + (es ? "relevancia" : "relevance")
                          : ""}
                      </p>
                      <h4>{card.title}</h4>
                      {card.text
                        ? (
                          <div className={styles.transcriptPassage}>
                            <span>
                              {es
                                ? "Pasaje de transcripción de IA sin revisar · cita no aprobada"
                                : "Unreviewed AI transcript passage · not quote-approved"}
                            </span>
                            <p>{card.text}</p>
                          </div>
                        )
                        : null}
                      <a
                        href={sourceHref(card)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {card.timestampLabel
                          ? (es
                            ? "Abrir en " + card.timestampLabel
                            : "Open at " + card.timestampLabel)
                          : (es
                            ? "Abrir testimonio original"
                            : "Open original testimony")}
                      </a>
                    </li>
                  ))}
                </ol>
              </details>
            )
            : null}
        </div>
      </div>

      <section
        className={styles.authenticSection}
        aria-labelledby="authentic-testimony-title"
      >
        <div className={styles.authenticCopy}>
          <p className={styles.kicker}>
            {es ? "Testimonio auténtico · no IA" : "Authentic testimony · not AI"}
          </p>
          <h2 id="authentic-testimony-title">
            {es
              ? "Escuchar la voz auténtica de Susanne"
              : "Hear Susanne’s authentic voice"}
          </h2>
          <p>
            {es
              ? "Esta es una grabación publicada del testimonio real de Susanne “Zsuzsi” Weisz Jalnos. Su voz no fue generada ni modificada por IA. El reproductor con privacidad mejorada transmite desde YouTube; este sitio no descarga ni vuelve a alojar la grabación."
              : "This is a published recording of Susanne “Zsuzsi” Weisz Jalnos’s real testimony. Her voice here is not generated or altered by AI. The privacy-enhanced player streams from YouTube; this site does not download or rehost the recording."}
          </p>
          <p className={styles.stewardLine}>
            {es
              ? "Publicado por JFSA/HMMSA · grabación auténtica"
              : "Published by JFSA/HMMSA · authentic recording"}
          </p>
          <p className={styles.captionNotice}>
            {es
              ? "Los subtítulos automáticos en inglés disponibles en YouTube están activados de forma predeterminada. Aún no han sido revisados por la organización responsable."
              : "YouTube’s available automatic English captions are enabled by default. They have not yet been reviewed by the steward organization."}
          </p>
        </div>
        <div className={styles.videoWrap}>
          <iframe
            src="https://www.youtube-nocookie.com/embed/I-Xq1fGq_gI?cc_load_policy=1&cc_lang_pref=en"
            title={es
              ? "Testimonio auténtico de Susanne Zsuzsi Weisz Jalnos"
              : "Authentic testimony of Susanne Zsuzsi Weisz Jalnos"}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      </section>

      <section
        className={styles.testimonySection}
        aria-labelledby="testimony-links-title"
      >
        <div>
          <p className={styles.kicker}>
            {es ? "Material publicado" : "Published testimony"}
          </p>
          <h2 id="testimony-links-title">
            {es ? "Más grabaciones auténticas" : "More authentic recordings"}
          </h2>
          <p>
            {es
              ? "Estos enlaces abren fragmentos publicados por las organizaciones custodias. Permanecen separados de las respuestas de IA."
              : "These links open excerpts published by the steward organizations. They remain separate from AI answers."}
          </p>
        </div>
        <ul className={styles.testimonyLinks}>
          <li>
            <a
              href="https://www.youtube.com/watch?v=I-Xq1fGq_gI"
              target="_blank"
              rel="noreferrer"
            >
              {es
                ? "Abrir el testimonio completo en YouTube · HMMSA/JFSA"
                : "Open the full testimony on YouTube · HMMSA/JFSA"}
            </a>
          </li>
          <li>
            <a
              href="https://www.youtube.com/watch?v=PpIj8cFPNHA"
              target="_blank"
              rel="noreferrer"
            >
              {es
                ? "Auschwitz: intimidación · fragmento de HMMSA"
                : "Auschwitz: intimidation · HMMSA excerpt"}
            </a>
          </li>
          <li>
            <a
              href="https://www.youtube.com/watch?v=SMAOWOrdoaY"
              target="_blank"
              rel="noreferrer"
            >
              {es
                ? "Consecuencias del Holocausto · fragmento de HMMSA"
                : "Aftermath of the Holocaust · HMMSA excerpt"}
            </a>
          </li>
          <li>
            <a
              href="https://www.youtube.com/watch?v=u9eqJ6XHewo"
              target="_blank"
              rel="noreferrer"
            >
              {es
                ? "Apoyo de la familia · fragmento de HMMSA"
                : "Support from family · HMMSA excerpt"}
            </a>
          </li>
        </ul>
      </section>

      <p className={styles.ephemeralNote}>
        {es
          ? "La aplicación no guarda el audio de su micrófono ni el historial visible de esta conversación. Al terminar, salir de la página o llegar a 10 minutos, se cierran las conexiones y se borran los subtítulos y las fuentes de la pantalla. Los materiales aprobados del archivo permanecen en sus sistemas privados de origen."
          : "The application does not save your microphone audio or the visible history of this conversation. Ending, leaving the page, or reaching 10 minutes closes the connection and clears captions and sources from the screen. Approved archival source material remains in its separate private source systems."}
      </p>
    </section>
  );
}
