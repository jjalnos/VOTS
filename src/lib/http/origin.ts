function addOrigin(origins: Set<string>, value: string | null | undefined): void {
  if (!value) return;
  try {
    origins.add(new URL(value).origin);
  } catch {
    // Invalid configured/request origins are never trusted.
  }
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
    return trustedRequestOrigins(request).has(new URL(supplied).origin);
  } catch {
    return false;
  }
}
