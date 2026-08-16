import { isIP } from "node:net";

export type BoundedJsonFailureReason =
  | "invalid-json"
  | "too-large"
  | "unsupported-media-type";

export type BoundedJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: BoundedJsonFailureReason };

function validIpLiteral(value: string | null | undefined): string | undefined {
  const candidate = value?.trim();
  return candidate && isIP(candidate) ? candidate : undefined;
}

/**
 * Cloudways terminates application traffic at a managed proxy. Prefer the
 * proxy-authored real-IP header, then its final appended forwarding hop. A
 * caller-supplied first X-Forwarded-For value can never create a new bucket.
 */
export function trustedProxyClientAddress(request: Request): string {
  const realIp = validIpLiteral(request.headers.get("x-real-ip"));
  if (realIp) return realIp;

  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const finalForwardedHop = validIpLiteral(forwarded?.at(-1));
  if (finalForwardedHop) return finalForwardedHop;

  return validIpLiteral(request.headers.get("cf-connecting-ip")) ?? "unknown";
}

export async function readBoundedJson(
  request: Request,
  maximumBytes: number,
  options: { requireJsonContentType?: boolean } = {},
): Promise<BoundedJsonResult> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new RangeError("A positive bounded JSON byte limit is required.");
  }

  if (
    options.requireJsonContentType &&
    !request.headers.get("content-type")?.toLocaleLowerCase("en").startsWith("application/json")
  ) {
    return { ok: false, reason: "unsupported-media-type" };
  }

  const rawDeclaredLength = request.headers.get("content-length");
  if (rawDeclaredLength !== null) {
    const declaredLength = Number(rawDeclaredLength);
    if (!Number.isSafeInteger(declaredLength) || declaredLength < 0) {
      return { ok: false, reason: "invalid-json" };
    }
    if (declaredLength > maximumBytes) return { ok: false, reason: "too-large" };
  }

  if (!request.body) return { ok: false, reason: "invalid-json" };
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let byteLength = 0;
  let text = "";

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      byteLength += chunk.value.byteLength;
      if (byteLength > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too-large" };
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, reason: "invalid-json" };
  } finally {
    reader.releaseLock();
  }
}
