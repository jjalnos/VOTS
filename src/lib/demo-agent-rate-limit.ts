const WINDOW_MILLISECONDS = 60_000;
const REQUESTS_PER_WINDOW = 40;
const MAX_TRACKED_CLIENTS = 5_000;

interface RateLimitEntry {
  count: number;
  windowStartedAt: number;
}

export interface DemoAgentRateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

const clients = new Map<string, RateLimitEntry>();

function pruneExpired(now: number): void {
  for (const [key, entry] of clients) {
    if (now - entry.windowStartedAt >= WINDOW_MILLISECONDS) clients.delete(key);
  }
}

export function checkDemoAgentRateLimit(
  rawKey: string,
  now = Date.now(),
): DemoAgentRateLimitResult {
  const key = rawKey.trim().slice(0, 160) || "unknown";
  if (clients.size >= MAX_TRACKED_CLIENTS) pruneExpired(now);
  if (clients.size >= MAX_TRACKED_CLIENTS && !clients.has(key)) {
    const oldestKey = clients.keys().next().value as string | undefined;
    if (oldestKey) clients.delete(oldestKey);
  }

  const previous = clients.get(key);
  const entry =
    !previous || now - previous.windowStartedAt >= WINDOW_MILLISECONDS
      ? { count: 0, windowStartedAt: now }
      : previous;
  entry.count += 1;
  clients.delete(key);
  clients.set(key, entry);

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((WINDOW_MILLISECONDS - (now - entry.windowStartedAt)) / 1_000),
  );
  return {
    allowed: entry.count <= REQUESTS_PER_WINDOW,
    remaining: Math.max(0, REQUESTS_PER_WINDOW - entry.count),
    retryAfterSeconds,
  };
}

export function demoAgentClientKey(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function resetDemoAgentRateLimitForTests(): void {
  clients.clear();
}
