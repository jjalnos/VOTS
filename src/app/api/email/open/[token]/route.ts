import { after } from "next/server";
import {
  hashTrackingToken,
  TRACKING_TOKEN_PATTERN,
  type EmailLogRecorder,
} from "@/lib/email/log";
import { defaultEmailLogRecorder } from "@/lib/email/log-store";

export const dynamic = "force-dynamic";

/**
 * The open-tracking pixel.
 *
 * Every request, whatever the token looks like, gets the same one-pixel GIF
 * with the same status and headers: there is no way to learn from the
 * response whether a token exists. The only variation is whether an update
 * is scheduled, and that happens after the response has been sent. The
 * handler reads no headers and sets no cookies, so IP addresses and user
 * agents never reach the log.
 */
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");

const HEADERS = {
  "Content-Type": "image/gif",
  "Content-Length": String(GIF.byteLength),
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
} as const;

export interface OpenPixelDependencies {
  recorder: EmailLogRecorder;
  /** Runs the recording after the response; defaults to Next's `after()`. */
  schedule: (task: () => Promise<void>) => void;
}

type PixelContext = { params: Promise<{ token: string }> };

export function createOpenPixelHandlers(
  dependencies: OpenPixelDependencies = {
    recorder: defaultEmailLogRecorder(),
    schedule: (task) => after(task),
  },
) {
  function respond(method: "GET" | "HEAD"): Response {
    return new Response(method === "HEAD" ? null : new Uint8Array(GIF), {
      status: 200,
      headers: HEADERS,
    });
  }

  async function GET(_request: Request, context: PixelContext): Promise<Response> {
    const { token } = await context.params;
    if (typeof token === "string" && TRACKING_TOKEN_PATTERN.test(token)) {
      const hash = hashTrackingToken(token);
      dependencies.schedule(async () => {
        try {
          await dependencies.recorder.markOpened(hash);
        } catch {
          console.error("Email open signal could not be recorded.");
        }
      });
    }
    return respond("GET");
  }

  /** Mail scanners probe with HEAD; a probe is not a person opening the message. */
  async function HEAD(_request: Request, context: PixelContext): Promise<Response> {
    await context.params;
    return respond("HEAD");
  }

  return { GET, HEAD };
}

export const { GET, HEAD } = createOpenPixelHandlers();
