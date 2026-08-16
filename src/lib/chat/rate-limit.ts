import { trustedProxyClientAddress } from "@/lib/http/request";

const WINDOW_MILLISECONDS = 60_000;
const CLIENT_REQUESTS_PER_WINDOW = 30;
const GLOBAL_REQUESTS_PER_WINDOW = 180;
const MAX_TRACKED_CLIENTS = 5_000;

interface RateLimitEntry {
  count: number;
  windowStartedAt: number;
}

export interface PublicChatRateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

const clients = new Map<string, RateLimitEntry>();
let globalEntry: RateLimitEntry | undefined;

function consume(
  previous: RateLimitEntry | undefined,
  now: number,
): RateLimitEntry {
  const entry =
    !previous || now - previous.windowStartedAt >= WINDOW_MILLISECONDS
      ? { count: 0, windowStartedAt: now }
      : previous;
  entry.count += 1;
  return entry;
}

function retryAfter(entry: RateLimitEntry, now: number): number {
  return Math.max(
    1,
    Math.ceil((WINDOW_MILLISECONDS - (now - entry.windowStartedAt)) / 1_000),
  );
}

function pruneExpired(now: number): void {
  for (const [key, entry] of clients) {
    if (now - entry.windowStartedAt >= WINDOW_MILLISECONDS) clients.delete(key);
  }
}

export function checkPublicChatRateLimit(
  request: Request,
  now = Date.now(),
): PublicChatRateLimitResult {
  const clientKey = trustedProxyClientAddress(request);
  if (clients.size >= MAX_TRACKED_CLIENTS) pruneExpired(now);
  if (clients.size >= MAX_TRACKED_CLIENTS && !clients.has(clientKey)) {
    const oldestKey = clients.keys().next().value as string | undefined;
    if (oldestKey) clients.delete(oldestKey);
  }

  const clientEntry = consume(clients.get(clientKey), now);
  clients.delete(clientKey);
  clients.set(clientKey, clientEntry);
  globalEntry = consume(globalEntry, now);

  return {
    allowed:
      clientEntry.count <= CLIENT_REQUESTS_PER_WINDOW &&
      globalEntry.count <= GLOBAL_REQUESTS_PER_WINDOW,
    remaining: Math.max(
      0,
      Math.min(
        CLIENT_REQUESTS_PER_WINDOW - clientEntry.count,
        GLOBAL_REQUESTS_PER_WINDOW - globalEntry.count,
      ),
    ),
    retryAfterSeconds: Math.max(
      retryAfter(clientEntry, now),
      retryAfter(globalEntry, now),
    ),
  };
}

export function resetPublicChatRateLimitForTests(): void {
  clients.clear();
  globalEntry = undefined;
}
