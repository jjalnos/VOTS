import { trustedProxyClientAddress } from "@/lib/http/request";

type SusanneRateLimitScope = "realtime" | "search";

interface RateLimitEntry {
  count: number;
  windowStartedAt: number;
}

export interface SusanneRateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

const WINDOW_MILLISECONDS = 60_000;
const MAX_TRACKED_KEYS = 2_000;
const LIMITS: Record<SusanneRateLimitScope, { client: number; global: number }> = {
  realtime: { client: 6, global: 24 },
  search: { client: 30, global: 120 },
};

const clientEntries = new Map<string, RateLimitEntry>();
const globalEntries = new Map<SusanneRateLimitScope, RateLimitEntry>();

function consume(previous: RateLimitEntry | undefined, now: number): RateLimitEntry {
  const entry =
    !previous || now - previous.windowStartedAt >= WINDOW_MILLISECONDS
      ? { count: 0, windowStartedAt: now }
      : previous;
  entry.count += 1;
  return entry;
}

function pruneExpired(now: number): void {
  for (const [key, entry] of clientEntries) {
    if (now - entry.windowStartedAt >= WINDOW_MILLISECONDS) clientEntries.delete(key);
  }
}

function retryAfter(entry: RateLimitEntry, now: number): number {
  return Math.max(
    1,
    Math.ceil((WINDOW_MILLISECONDS - (now - entry.windowStartedAt)) / 1_000),
  );
}

export function checkSusanneRateLimit(
  scope: SusanneRateLimitScope,
  request: Request,
  actorUserId: string,
  now = Date.now(),
): SusanneRateLimitResult {
  const address = trustedProxyClientAddress(request);
  const clientKey = `${scope}:${actorUserId.trim().slice(0, 160)}:${address}`;
  if (clientEntries.size >= MAX_TRACKED_KEYS) pruneExpired(now);
  if (clientEntries.size >= MAX_TRACKED_KEYS && !clientEntries.has(clientKey)) {
    const oldestKey = clientEntries.keys().next().value as string | undefined;
    if (oldestKey) clientEntries.delete(oldestKey);
  }

  const client = consume(clientEntries.get(clientKey), now);
  clientEntries.delete(clientKey);
  clientEntries.set(clientKey, client);
  const global = consume(globalEntries.get(scope), now);
  globalEntries.set(scope, global);
  const limits = LIMITS[scope];

  return {
    allowed: client.count <= limits.client && global.count <= limits.global,
    remaining: Math.max(
      0,
      Math.min(limits.client - client.count, limits.global - global.count),
    ),
    retryAfterSeconds: Math.max(retryAfter(client, now), retryAfter(global, now)),
  };
}

export function resetSusanneRateLimitsForTests(): void {
  clientEntries.clear();
  globalEntries.clear();
}
