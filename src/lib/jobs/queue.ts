import { randomUUID } from "node:crypto";

export type JobType = "extract_archive_item" | "research_request" | "translation_suggestion";
export type JobStatus = "queued" | "running" | "completed" | "failed";

export interface BackgroundJob<TPayload = Record<string, unknown>> {
  id: string;
  type: JobType;
  payload: TPayload;
  status: JobStatus;
  requestedBy: string;
  createdAt: string;
}

export interface BackgroundJobQueue {
  enqueue<TPayload extends Record<string, unknown>>(
    type: JobType,
    payload: TPayload,
    requestedBy: string,
  ): Promise<BackgroundJob<TPayload>>;
}

export class DevelopmentJobQueue implements BackgroundJobQueue {
  async enqueue<TPayload extends Record<string, unknown>>(
    type: JobType,
    payload: TPayload,
    requestedBy: string,
  ): Promise<BackgroundJob<TPayload>> {
    return {
      id: randomUUID(),
      type,
      payload,
      status: "queued",
      requestedBy,
      createdAt: new Date().toISOString(),
    };
  }
}

export function getBackgroundJobQueue(): BackgroundJobQueue {
  return new DevelopmentJobQueue();
}
