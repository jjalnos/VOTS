import type {
  DemoArchiveRateLimitResult,
  DemoArchiveStore,
} from "@/lib/demo-archive/store";
import { trustedProxyClientAddress } from "@/lib/http/request";

const UPLOAD_WINDOW_SECONDS = 60 * 60;
const UPLOADS_PER_WINDOW = 24;

export function checkDemoArchiveUploadLimit(
  request: Request,
  actorUserId: string,
  store: DemoArchiveStore,
  now = new Date(),
): Promise<DemoArchiveRateLimitResult> {
  return store.consumeUploadLimit(
    [
      `archive-upload:actor:${actorUserId}`,
      `archive-upload:ip:${trustedProxyClientAddress(request)}`,
    ],
    now,
    UPLOAD_WINDOW_SECONDS,
    UPLOADS_PER_WINDOW,
  );
}
