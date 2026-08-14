import { NextResponse } from "next/server";
import { answerDemoAgent, demoAgentRequestSchema } from "@/lib/demo-agent";
import {
  checkDemoAgentRateLimit,
  demoAgentClientKey,
} from "@/lib/demo-agent-rate-limit";

const noStoreHeaders = { "Cache-Control": "no-store" };

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

  const parsed = demoAgentRequestSchema.safeParse(await request.json().catch(() => null));
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
