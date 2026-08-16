const FORBIDDEN_HOST_SUFFIXES = [
  "openai.com",
  "chatgpt.com",
  "oaistatic.com",
  "oaiusercontent.com",
  "openai.azure.com",
];

function normalizedAllowedHosts(value = process.env.LOCAL_AI_ALLOWED_HOSTS): Set<string> | null {
  const hosts = value
    ?.split(",")
    .map((host) => host.trim().toLocaleLowerCase("en"))
    .filter(Boolean);
  return hosts?.length ? new Set(hosts) : null;
}

export function isSafeInternalAIEndpoint(
  value: string | undefined,
  allowedHosts = normalizedAllowedHosts(),
): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLocaleLowerCase("en").replace(/\.$/, "");
    if (!hostname || !["http:", "https:"].includes(url.protocol)) return false;
    if (url.username || url.password) return false;
    if (
      FORBIDDEN_HOST_SUFFIXES.some(
        (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
      )
    ) {
      return false;
    }
    // A non-OpenAI hostname is not automatically an internal service. Requiring
    // an exact operator-owned allowlist entry prevents a custom-domain proxy or
    // arbitrary public OpenAI-compatible API from becoming the archive path.
    if (!allowedHosts || !allowedHosts.has(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

export function assertSafeInternalAIEndpoint(value: string): void {
  if (!isSafeInternalAIEndpoint(value)) {
    throw new Error("The internal AI endpoint is not an approved self-hosted endpoint.");
  }
}
