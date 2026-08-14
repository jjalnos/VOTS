export type StudioSurvivorSlug = "sam-cohen" | "stephan-jalnos";

export type EvidenceState = "approved" | "review" | "gap";

export type ChapterStatus =
  | "Needs sources"
  | "Evidence mapping"
  | "Source review"
  | "Drafting"
  | "Ready for Robin";

export interface StudioSource {
  id: string;
  label: string;
  publisher: string;
  href: string;
  role: "approved-evidence" | "review-lead";
}

export interface StudioEvidenceItem {
  id: string;
  state: EvidenceState;
  label: string;
  detail: string;
  sourceId?: string;
}

export interface StudioChapter {
  id: string;
  number: string;
  title: string;
  status: ChapterStatus;
  evidenceLabel: string;
  note: string;
}

export interface StudioArchiveGroup {
  label: string;
  count: number;
  note: string;
}

export interface StudioDossier {
  slug: StudioSurvivorSlug;
  name: string;
  contextLine: string;
  approvedSummary: string;
  archiveCount: number;
  evidence: StudioEvidenceItem[];
  chapters: StudioChapter[];
  archiveGroups: StudioArchiveGroup[];
  sources: StudioSource[];
  researchPrompts: string[];
  personaPrompts: string[];
}

const samSource: StudioSource = {
  id: "hmmsa:source:sam-cohen-oral-history",
  label: "Jewish Survivor Sam Cohen Testimony | USC Shoah Foundation",
  publisher: "USC Shoah Foundation",
  href: "https://www.youtube.com/watch?v=fTA6H0ChY_E",
  role: "review-lead",
};

const samProfileSource: StudioSource = {
  id: "hmmsa:source:survivors-experts",
  label: "Survivors & Experts — Sam Cohen section",
  publisher: "The Holocaust Memorial Museum of San Antonio",
  href: "https://www.hmmsa.org/survivors-experts",
  role: "approved-evidence",
};

const stephanSource: StudioSource = {
  id: "hmmsa:source:stephan-jalnos-speakers-series",
  label: "Survivor Speakers Series: Stephan Jalnos",
  publisher: "The Holocaust Memorial Museum of San Antonio",
  href:
    "https://www.hmmsa.org/all-events/survivor-speakers-series-the-stories-of-holocaust-survivors-told-by-their-descendants",
  role: "approved-evidence",
};

export const STUDIO_DOSSIERS: Record<StudioSurvivorSlug, StudioDossier> = {
  "sam-cohen": {
    slug: "sam-cohen",
    name: "Sam Cohen",
    contextLine: "Salonika, Greece · resistance · San Antonio",
    approvedSummary:
      "The approved public profile says Sam Cohen grew up in Salonika, Greece, endured forced labor, escaped, joined the resistance, and later built a life in San Antonio.",
    archiveCount: 14,
    sources: [samProfileSource, samSource],
    evidence: [
      {
        id: "sam-salonika",
        state: "approved",
        label: "Early life in Salonika",
        detail: "The approved public profile identifies Salonika, Greece, as the place where Sam Cohen grew up.",
        sourceId: samProfileSource.id,
      },
      {
        id: "sam-survival",
        state: "approved",
        label: "Forced labor, escape, and resistance",
        detail: "These experiences appear in the approved public summary and may anchor a sourced chronology.",
        sourceId: samProfileSource.id,
      },
      {
        id: "sam-san-antonio",
        state: "approved",
        label: "Later life in San Antonio",
        detail: "The approved public profile establishes that he later built a life in San Antonio.",
        sourceId: samProfileSource.id,
      },
      {
        id: "sam-transcript-pass",
        state: "review",
        label: "Map the oral history to chapter notes",
        detail: "Editorial task: review the testimony and attach time-coded evidence before adding finer detail.",
        sourceId: samSource.id,
      },
      {
        id: "sam-birth-details",
        state: "gap",
        label: "Birthplace, birth year, and family details",
        detail: "The currently approved demo record establishes where Sam grew up, not where or when he was born or who his parents were. Do not infer them.",
      },
    ],
    chapters: [
      {
        id: "sam-ch-01",
        number: "01",
        title: "A life in Salonika",
        status: "Evidence mapping",
        evidenceLabel: "1 approved anchor · more detail needed",
        note: "Organize approved place references before drafting. Do not add dates without a reviewed source.",
      },
      {
        id: "sam-ch-02",
        number: "02",
        title: "Forced labor and escape",
        status: "Source review",
        evidenceLabel: "Approved summary · testimony review queued",
        note: "Map each narrative passage to the oral history before expanding the chronology.",
      },
      {
        id: "sam-ch-03",
        number: "03",
        title: "With the resistance",
        status: "Drafting",
        evidenceLabel: "Approved anchor · citation required per passage",
        note: "Keep the prose within what the reviewed testimony supports.",
      },
      {
        id: "sam-ch-04",
        number: "04",
        title: "A life rebuilt",
        status: "Evidence mapping",
        evidenceLabel: "San Antonio established · details remain open",
        note: "Separate confirmed later-life facts from family recollections awaiting review.",
      },
      {
        id: "sam-ch-05",
        number: "05",
        title: "Questions still open",
        status: "Needs sources",
        evidenceLabel: "Research gaps collected here",
        note: "Use this chapter space as a research queue, not as publishable prose.",
      },
    ],
    archiveGroups: [
      { label: "Oral history", count: 3, note: "Synthetic organization fixture" },
      { label: "Working documents", count: 7, note: "Synthetic organization fixture" },
      { label: "Image records", count: 3, note: "Synthetic organization fixture" },
      { label: "Research logs", count: 1, note: "Synthetic organization fixture" },
    ],
    researchPrompts: [
      "Which claims are approved for Sam Cohen?",
      "What details still need curator verification?",
      "Build a source checklist for the resistance chapter.",
    ],
    personaPrompts: [
      "What does the approved archive say about Sam Cohen?",
      "How should I cite the current account?",
      "Which details are still unknown?",
    ],
  },
  "stephan-jalnos": {
    slug: "stephan-jalnos",
    name: "Stephan Jalnos",
    contextLine: "Łódź Ghetto · resistance · Mauthausen",
    approvedSummary:
      "The approved public profile traces Stephan Jalnos’s story from the Łódź Ghetto and resistance to Mauthausen and survival. His son, Robi Jalnos, shared the story in HMMSA’s Survivor Speakers Series.",
    archiveCount: 13,
    sources: [stephanSource],
    evidence: [
      {
        id: "stephan-lodz",
        state: "approved",
        label: "The Łódź Ghetto",
        detail: "The approved HMMSA event account places the Łódź Ghetto in Stephan Jalnos’s story.",
        sourceId: stephanSource.id,
      },
      {
        id: "stephan-resistance-mauthausen",
        state: "approved",
        label: "Resistance, Mauthausen, and survival",
        detail: "These elements are established in the approved public profile, without a detailed chronology.",
        sourceId: stephanSource.id,
      },
      {
        id: "stephan-robi",
        state: "approved",
        label: "Story shared by Robi Jalnos",
        detail: "HMMSA identifies his son, Robi Jalnos, as the person who shared Stephan’s story.",
        sourceId: stephanSource.id,
      },
      {
        id: "stephan-chronology",
        state: "review",
        label: "Build a source-by-source chronology",
        detail: "Editorial task: locate and review evidence for dates and transitions before drafting them.",
        sourceId: stephanSource.id,
      },
      {
        id: "stephan-biographical-gaps",
        state: "gap",
        label: "Birth year and place, parents, and family occupation",
        detail: "The currently approved record does not establish these details. Łódź is part of the wartime story, not evidence of birthplace. They remain open research questions.",
      },
    ],
    chapters: [
      {
        id: "stephan-ch-01",
        number: "01",
        title: "Before the Łódź Ghetto",
        status: "Needs sources",
        evidenceLabel: "No approved detail in the demo record",
        note: "Hold this chapter open. Do not infer birth year or place, parentage, occupation, or prewar circumstances.",
      },
      {
        id: "stephan-ch-02",
        number: "02",
        title: "The Łódź Ghetto",
        status: "Evidence mapping",
        evidenceLabel: "1 approved anchor · chronology needed",
        note: "Start from the HMMSA event account and attach further reviewed sources before drafting dates.",
      },
      {
        id: "stephan-ch-03",
        number: "03",
        title: "Resistance and Mauthausen",
        status: "Source review",
        evidenceLabel: "Approved themes · sequence still open",
        note: "Keep the relationship between events unresolved until the evidence supports a chronology.",
      },
      {
        id: "stephan-ch-04",
        number: "04",
        title: "The story carried by Robi",
        status: "Drafting",
        evidenceLabel: "HMMSA event account approved",
        note: "Frame Robi clearly as the person sharing his father’s story; never simulate Stephan’s own voice.",
      },
      {
        id: "stephan-ch-05",
        number: "05",
        title: "Questions still open",
        status: "Needs sources",
        evidenceLabel: "3 major biographical gaps",
        note: "Track birth year and place, parents, and family occupation as unresolved questions.",
      },
    ],
    archiveGroups: [
      { label: "Family testimony", count: 3, note: "Synthetic organization fixture" },
      { label: "Working documents", count: 6, note: "Synthetic organization fixture" },
      { label: "Image records", count: 2, note: "Synthetic organization fixture" },
      { label: "Research logs", count: 2, note: "Synthetic organization fixture" },
    ],
    researchPrompts: [
      "Which Stephan Jalnos details remain unsupported?",
      "Show the evidence available for the Łódź chapter.",
      "Build a research queue for the missing birth details.",
    ],
    personaPrompts: [
      "What is established about Stephan Jalnos?",
      "Who shared Stephan Jalnos’s story?",
      "What does the archive not yet know?",
    ],
  },
};

export const STUDIO_CHAPTER_STATUSES: ChapterStatus[] = [
  "Needs sources",
  "Evidence mapping",
  "Source review",
  "Drafting",
  "Ready for Robin",
];
