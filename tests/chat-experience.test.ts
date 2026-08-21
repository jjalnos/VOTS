import { describe, expect, it } from "vitest";
import {
  functionCallsFromRealtimeEvent,
  normalizeTestimonySearchResult,
  realtimeGenerationIsCurrent,
  sourceHref,
} from "@/components/chat-experience";

describe("private Susanne conversation UI contracts", () => {
  it("recognizes completed Realtime tool calls without duplicating partial arguments", () => {
    expect(functionCallsFromRealtimeEvent({
      type: "response.function_call_arguments.done",
      response_id: "response_1",
      call_id: "call_1",
      name: "search_testimony",
      arguments: "{\"query\":\"What happened in Rajka?\"}",
    })).toEqual([{
      callId: "call_1",
      name: "search_testimony",
      arguments: "{\"query\":\"What happened in Rajka?\"}",
      responseId: "response_1",
    }]);

    expect(functionCallsFromRealtimeEvent({
      type: "response.output_item.done",
      item: {
        type: "function_call",
        call_id: "call_2",
        name: "search_testimony",
        arguments: "{\"query\":\"What did she establish?\"}",
      },
    })).toHaveLength(1);
  });

  it("rejects stale, aborted, and unmounted search generations", () => {
    const expected = { session: 4, turn: 9 };

    expect(realtimeGenerationIsCurrent(expected, expected, false, true)).toBe(true);
    expect(realtimeGenerationIsCurrent(expected, { session: 5, turn: 9 }, false, true)).toBe(false);
    expect(realtimeGenerationIsCurrent(expected, { session: 4, turn: 10 }, false, true)).toBe(false);
    expect(realtimeGenerationIsCurrent(expected, expected, true, true)).toBe(false);
    expect(realtimeGenerationIsCurrent(expected, expected, false, false)).toBe(false);
  });

  it("renders only safe source URLs and preserves ungrounded refusals", () => {
    const result = normalizeTestimonySearchResult({
      grounded: false,
      refusal: "That is not established in Susanne’s testimony.",
      passages: [
        {
          id: "unsafe",
          text: "Do not render this as a link.",
          sourceTitle: "Unsafe",
          sourceUrl: "javascript:alert(1)",
        },
      ],
      sources: [
        {
          title: "Susanne Jalnos testimony",
          url: "https://www.youtube.com/watch?v=I-Xq1fGq_gI",
          kind: "video",
        },
      ],
    });

    expect(result.grounded).toBe(false);
    expect(result.refusal).toBe("That is not established in Susanne’s testimony.");
    expect(result.cards).toEqual([
      expect.objectContaining({
        title: "Susanne Jalnos testimony",
        kind: "video",
      }),
    ]);
  });

  it("turns retrieved YouTube timestamps into direct source links", () => {
    const href = sourceHref({
      url: "https://www.youtube.com/watch?v=I-Xq1fGq_gI",
      timestampSeconds: 82.9,
    });

    expect(new URL(href).searchParams.get("t")).toBe("82s");
  });
});
