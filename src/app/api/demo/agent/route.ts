import { NextResponse } from "next/server";
import { answerDemoAgent, demoAgentRequestSchema } from "@/lib/demo-agent";
import {
  checkDemoAgentRateLimit,
  demoAgentClientKey,
} from "@/lib/demo-agent-rate-limit";
import { readBoundedJson } from "@/lib/http/request";

const noStoreHeaders = { "Cache-Control": "no-store" };
const MAX_BODY_BYTES = 4 * 1024;

export async function POST(request: Request) {
  const rateLimit = checkDemoAgentRateLimit(demoAgentClientKey(request));
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Robin is receiving too many messages. Please try again shortly." },
      {
        status: 429,
        headers: {
          ...noStoreHeaders,
          "Retry-After": String(rateLimit.retryAfterSeconds),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  const json = await readBoundedJson(request, MAX_BODY_BYTES);
  if (!json.ok && json.reason === "too-large") {
    return NextResponse.json(
      { error: "The Robin demo request is too large." },
      {
        status: 413,
        headers: {
          ...noStoreHeaders,
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        },
      },
    );
  }
  const parsed = demoAgentRequestSchema.safeParse(json.ok ? json.value : null);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Send a message between 2 and 600 characters with valid chat history." },
      {
        status: 400,
        headers: {
          ...noStoreHeaders,
          "X-RateLimit-Remaining": String(rateLimit.remaining),
        },
      },
    );
  }

  const response = await answerDemoAgent(parsed.data);
  return NextResponse.json(response, {
    headers: {
      ...noStoreHeaders,
      "X-RateLimit-Remaining": String(rateLimit.remaining),
    },
  });
}
