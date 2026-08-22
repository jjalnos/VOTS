import { describe, expect, it } from "vitest";
import {
  functionCallsFromRealtimeEvent,
  GUIDE_VOICE_DISCLOSURE,
  modelFacingTestimonyResult,
  normalizeTestimonySearchResult,
  realtimeGenerationIsCurrent,
  sourceHref,
} from "@/components/chat-experience";

describe("private Susanne conversation UI contracts", () => {
  it("identifies Cedar as an AI guide voice in both supported locales", () => {
    expect(GUIDE_VOICE_DISCLOSURE.en).toContain("built-in “cedar” voice");
    expect(GUIDE_VOICE_DISCLOSURE.en).toContain("not Susanne and not a clone");
    expect(GUIDE_VOICE_DISCLOSURE.es).toContain("voz integrada «cedar» de OpenAI");
    expect(GUIDE_VOICE_DISCLOSURE.es).toContain("no son Susanne ni un clon");
  });

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
      refusal: "I don’t have enough information about Susanne to answer that.",
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
    expect(result.refusal).toBe("I don’t have enough information about Susanne to answer that.");
    expect(result.cards).toEqual([
      expect.objectContaining({
        title: "Susanne Jalnos testimony",
        kind: "video",
      }),
    ]);
  });

  it("keeps citation metadata out of the model-facing evidence", () => {
    const result = normalizeTestimonySearchResult({
      grounded: true,
      refusal: "I don’t have enough information about Susanne to answer that.",
      passages: [{
        id: "passage-1",
        text: [
          "Susanne ‘Zsuzsi’ Weisz Jalnos — testimony passage at 14:00",
          "Source: https://www.youtube.com/watch?v=I-Xq1fGq_gI",
          "Transcript status: AI-transcribed from YouTube; unreviewed",
          "She was imprisoned at Auschwitz for six weeks.",
        ].join("\n"),
        sourceTitle: "Susanne testimony · JFSA/HMMSA",
        sourceUrl: "https://www.youtube.com/watch?v=I-Xq1fGq_gI&t=840s",
        timestampSeconds: 840,
        timestampLabel: "14:00",
        citationLabel: "Susanne testimony · 14:00",
        score: 0.91,
      }],
    });

    const modelResult = modelFacingTestimonyResult(result);
    expect(modelResult).toEqual({
      grounded: true,
      quote_approved: false,
      passages: [{
        text: "She was imprisoned at Auschwitz for six weeks.",
        untrusted: true,
      }],
      refusal: "I don’t have enough information about Susanne to answer that.",
    });
    expect(JSON.stringify(modelResult)).not.toMatch(
      /sourceTitle|sourceUrl|timestamp|citation|score|confidence|youtube|jfsa|hmmsa|14:00/i,
    );
  });

  it("turns retrieved YouTube timestamps into direct source links", () => {
    const href = sourceHref({
      url: "https://www.youtube.com/watch?v=I-Xq1fGq_gI",
      timestampSeconds: 82.9,
    });

    expect(new URL(href).searchParams.get("t")).toBe("82s");
  });
});
