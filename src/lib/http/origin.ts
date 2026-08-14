function addOrigin(origins: Set<string>, value: string | null | undefined): void {
  if (!value) return;
  try {
    origins.add(new URL(value).origin);
  } catch {
    // Invalid configured/request origins are never trusted.
  }
}

function firstHeaderValue(value: string | null): string | null {
  const first = value?.split(",", 1)[0]?.trim().toLowerCase();
  return first || null;
}

function matchesSecureProxyHost(origin: URL, rawHost: string | null): boolean {
  if (origin.protocol !== "https:") return false;
  const host = firstHeaderValue(rawHost);
  if (!host || /[\s/@\\]/.test(host)) return false;
  return origin.host.toLowerCase() === host;
}

export function trustedRequestOrigins(request: Request): Set<string> {
  const origins = new Set<string>();
  addOrigin(origins, request.url);
  addOrigin(origins, process.env.NEXT_PUBLIC_SITE_URL);
  return origins;
}

export function hasTrustedOrigin(request: Request): boolean {
  const supplied = request.headers.get("origin");
  if (!supplied) return false;
  try {
    const suppliedOrigin = new URL(supplied);
    if (trustedRequestOrigins(request).has(suppliedOrigin.origin)) return true;

    // Managed reverse proxies commonly expose an internal request URL to
    // Next.js while preserving the visitor-facing host in forwarded headers.
    // Only accept that fallback for HTTPS and an exact host/port match.
    return (
      matchesSecureProxyHost(suppliedOrigin, request.headers.get("x-forwarded-host")) ||
      matchesSecureProxyHost(suppliedOrigin, request.headers.get("host"))
    );
  } catch {
    return false;
  }
}
