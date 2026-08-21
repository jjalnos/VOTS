import type { Locale } from "@/lib/domain/types";

/**
 * Testimony the museum has already published for each survivor: recorded
 * interviews, written accounts, and the talks their descendants give.
 *
 * Every entry is a link the museum publishes on its own Survivors & Experts
 * page, and each was attached to its survivor by reading which block of that
 * page contains it — not by matching names, which would have given Anna Weisz
 * Rado's introduction to Anna Levit. Nothing here is hosted by this archive;
 * these point at the museum's own material until the committee holds copies.
 */
export type TestimonyKind = "video" | "audio" | "document" | "feature";

export interface TestimonyLink {
  kind: TestimonyKind;
  url: string;
  label: Record<Locale, string>;
}

const t = (en: string, es: string): Record<Locale, string> => ({ en, es });

export const TESTIMONY: Record<string, TestimonyLink[]> = {
  "sam-cohen": [
    {
      kind: "video",
      url: "https://www.youtube.com/watch?v=NRaGZ6pJ98U",
      label: t("Sam Cohen's testimony", "El testimonio de Sam Cohen"),
    },
  ],
  "susanne-jalnos": [
    {
      kind: "video",
      url: "https://youtu.be/I-Xq1fGq_gI",
      label: t("Susanne Jalnos's testimony", "El testimonio de Susanne Jalnos"),
    },
    {
      kind: "video",
      url: "https://youtu.be/TGqTw6DGCgI",
      label: t("Her son presents her story", "Su hijo relata su historia"),
    },
  ],
  "stephan-jalnos": [
    {
      kind: "video",
      url: "https://youtu.be/_cKoBEkj9-A",
      label: t("His son presents his story", "Su hijo relata su historia"),
    },
  ],
  "rose-williams": [
    {
      kind: "video",
      url: "https://youtu.be/D66oikOJyyw",
      label: t("Rose Williams's testimony", "El testimonio de Rose Williams"),
    },
    {
      kind: "feature",
      url: "https://sway.office.com/Zf1DCmSnjGw7Gt7x",
      label: t("Letters to Rose: an online feature", "Letters to Rose: una experiencia en línea"),
    },
  ],
  "anna-levit": [
    {
      kind: "video",
      url: "https://youtu.be/jJw5NJYGyMw",
      label: t("Her daughter presents her story", "Su hija relata su historia"),
    },
  ],
  "anna-rado": [
    {
      kind: "video",
      url: "https://youtu.be/hRlA_I-nL9c",
      label: t("Anna Rado introduces herself", "Anna Rado se presenta"),
    },
  ],
  "david-scharff": [
    {
      kind: "document",
      url: "https://www.hmmsa.org/s/Testimony-David-Scharff.pdf",
      label: t("David Scharff's written testimony", "El testimonio escrito de David Scharff"),
    },
    {
      kind: "video",
      url: "https://youtu.be/a7uCtIU7R4E",
      label: t("Their daughter presents his story", "Su hija relata su historia"),
    },
  ],
  "golda-scharff": [
    {
      kind: "document",
      url: "https://www.hmmsa.org/s/GOLDA-SCHARFF-HOLOCAUST-SURVIVAL.pdf",
      label: t("Golda Scharff's written testimony", "El testimonio escrito de Golda Scharff"),
    },
  ],
  "george-fodor": [
    {
      kind: "video",
      url: "https://youtu.be/Nlce8jIt2uk",
      label: t("George Fodor's testimony", "El testimonio de George Fodor"),
    },
  ],
  "harry-weiss": [
    {
      kind: "video",
      url: "https://youtu.be/SJXG60BGZk0",
      label: t(
        "His daughter-in-law presents his story",
        "Su nuera relata su historia",
      ),
    },
  ],
  "ilona-haendel": [
    {
      kind: "audio",
      url: "https://archive.storycorps.org/secret/xCgEQiyOLVJzMgStwg0KcmMW4BA1J0N3YHZBOR7M0txdmVvbNKkGBK7hImPqBbHNWw9WRPTw",
      label: t("Ilona Haendel on her experience", "Ilona Haendel habla de su experiencia"),
    },
    {
      kind: "video",
      url: "https://youtu.be/FF4hctevwTI",
      label: t("Their daughter presents their story", "Su hija relata sus historias"),
    },
  ],
  "nathan-haendel": [
    {
      kind: "video",
      url: "https://youtu.be/FF4hctevwTI",
      label: t("Their daughter presents their story", "Su hija relata sus historias"),
    },
    {
      kind: "feature",
      url: "https://www.hmmsa.org/seeking-justice",
      label: t(
        "Seeking Justice: the museum's exhibit on his work as a Nazi hunter",
        "Seeking Justice: la exposición del museo sobre su labor como cazador de nazis",
      ),
    },
  ],
  "mathilde-rosenblatt": [
    {
      kind: "video",
      url: "https://youtu.be/1_zjcQBdr54",
      label: t("Her son presents her story", "Su hijo relata su historia"),
    },
  ],
};

const KIND_VERB: Record<TestimonyKind, Record<Locale, string>> = {
  video: t("Watch", "Ver"),
  audio: t("Listen", "Escuchar"),
  document: t("Read", "Leer"),
  feature: t("Explore", "Explorar"),
};

export function testimonyFor(slug: string): TestimonyLink[] {
  return TESTIMONY[slug] ?? [];
}

export function testimonyVerb(kind: TestimonyKind, locale: Locale): string {
  return KIND_VERB[kind][locale];
}
