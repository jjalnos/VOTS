export const SURVIVOR_STUDIO_INSTITUTION_IDS = ["hmmsa"] as const;
export type SurvivorStudioInstitutionId =
  (typeof SURVIVOR_STUDIO_INSTITUTION_IDS)[number];

export const SURVIVOR_STUDIO_SURVIVOR_SLUGS = [
  "sam-cohen",
  "stephan-jalnos",
] as const;
export type SurvivorStudioSurvivorSlug =
  (typeof SURVIVOR_STUDIO_SURVIVOR_SLUGS)[number];

export type SurvivorStudioCitationStyle = "Chicago" | "MLA" | "APA";

export interface SurvivorStudioSource {
  id: string;
  institutionId: SurvivorStudioInstitutionId;
  title: string;
  sectionTitle?: string;
  publisher: string;
  publisherShort: string;
  url: string;
  accessedOn: string;
  publishedOn?: string;
  creator?: string;
  sourceType: "museum-web-page" | "oral-history-video";
  approvalStatus: "curator-approved" | "review-lead";
}

export interface SurvivorStudioClaim {
  id: string;
  institutionId: SurvivorStudioInstitutionId;
  survivorSlug: SurvivorStudioSurvivorSlug;
  text: string;
  topics: string[];
  sourceIds: string[];
  evidenceLocator: string;
  status: "curator-approved";
  recordKind: "historical-claim";
}

export interface SurvivorStudioEvidenceGap {
  id: string;
  institutionId: SurvivorStudioInstitutionId;
  survivorSlug: SurvivorStudioSurvivorSlug;
  field: string;
  statement: string;
  searchTerms: string[];
  status: "not-established-in-approved-record";
}

export interface SurvivorStudioChapterPlan {
  id: string;
  institutionId: SurvivorStudioInstitutionId;
  survivorSlug: SurvivorStudioSurvivorSlug;
  workingTitle: string;
  purpose: string;
  claimIds: string[];
  openQuestionIds: string[];
  recordKind: "synthetic-organizational-metadata";
}

export interface SurvivorStudioPersonaGuardrails {
  mode: "third-person-archival-narrator";
  identityNotice: string;
  permitted: string[];
  prohibited: string[];
}

export interface SurvivorStudioProfile {
  institutionId: SurvivorStudioInstitutionId;
  survivorSlug: SurvivorStudioSurvivorSlug;
  displayName: string;
  historicalClaims: SurvivorStudioClaim[];
  evidenceGaps: SurvivorStudioEvidenceGap[];
  bookOrganization: {
    recordKind: "synthetic-organizational-metadata";
    notice: string;
    chapters: SurvivorStudioChapterPlan[];
  };
  personaGuardrails: SurvivorStudioPersonaGuardrails;
}

export interface SurvivorStudioInstitution {
  id: SurvivorStudioInstitutionId;
  name: string;
  shortName: string;
  sources: SurvivorStudioSource[];
  profiles: SurvivorStudioProfile[];
}

const hmmsaSources: SurvivorStudioSource[] = [
  {
    id: "hmmsa:source:survivors-experts",
    institutionId: "hmmsa",
    title: "Survivors & Experts",
    sectionTitle: "Sam Cohen",
    publisher: "The Holocaust Memorial Museum of San Antonio",
    publisherShort: "HMMSA",
    url: "https://www.hmmsa.org/survivors-experts",
    accessedOn: "2026-08-14",
    sourceType: "museum-web-page",
    approvalStatus: "curator-approved",
  },
  {
    id: "hmmsa:source:sam-cohen-oral-history",
    institutionId: "hmmsa",
    title: "Jewish Survivor Sam Cohen Testimony | USC Shoah Foundation",
    creator: "USC Shoah Foundation",
    publisher: "YouTube",
    publisherShort: "USC Shoah Foundation",
    url: "https://www.youtube.com/watch?v=fTA6H0ChY_E",
    accessedOn: "2026-08-14",
    sourceType: "oral-history-video",
    approvalStatus: "review-lead",
  },
  {
    id: "hmmsa:source:stephan-jalnos-speakers-series",
    institutionId: "hmmsa",
    title: "Survivor Speakers Series: The Stories of Holocaust Survivors Told by Their Descendants",
    publisher: "The Holocaust Memorial Museum of San Antonio",
    publisherShort: "HMMSA",
    url: "https://www.hmmsa.org/all-events/survivor-speakers-series-the-stories-of-holocaust-survivors-told-by-their-descendants",
    accessedOn: "2026-08-14",
    publishedOn: "2024-09-15",
    sourceType: "museum-web-page",
    approvalStatus: "curator-approved",
  },
];

const sharedGuardrails: SurvivorStudioPersonaGuardrails = {
  mode: "third-person-archival-narrator",
  identityNotice:
    "This preview is an archive assistant grounded in curator-approved sources. It is not the survivor and does not recreate the survivor's voice.",
  permitted: [
    "Summarize curator-approved historical claims in the third person.",
    "Provide source links and clearly formatted citations.",
    "State when the approved record does not establish an answer.",
    "Help organize approved evidence for a curator's writing workflow.",
  ],
  prohibited: [
    "Impersonating a survivor or speaking as though the assistant were the survivor.",
    "Inventing memories, feelings, dialogue, direct quotations, dates, relatives, or occupations.",
    "Presenting synthetic chapter organization as historical evidence.",
    "Treating an unapproved research lead as an established fact.",
  ],
};

const samClaims: SurvivorStudioClaim[] = [
  {
    id: "hmmsa:sam-cohen:claim:salonika-childhood",
    institutionId: "hmmsa",
    survivorSlug: "sam-cohen",
    text: "Sam Cohen grew up in a small, modest house in Salonika, Greece.",
    topics: ["childhood", "early life", "home", "salonika", "greece", "grew up"],
    sourceIds: ["hmmsa:source:survivors-experts"],
    evidenceLocator: "HMMSA survivor profile, Sam Cohen section",
    status: "curator-approved",
    recordKind: "historical-claim",
  },
  {
    id: "hmmsa:sam-cohen:claim:ghetto-1943",
    institutionId: "hmmsa",
    survivorSlug: "sam-cohen",
    text: "After Passover in 1943, Sam Cohen and his family were forced to move into the ghetto.",
    topics: ["1943", "passover", "ghetto", "family", "forced", "wartime"],
    sourceIds: ["hmmsa:source:survivors-experts"],
    evidenceLocator: "HMMSA survivor profile, Sam Cohen section",
    status: "curator-approved",
    recordKind: "historical-claim",
  },
  {
    id: "hmmsa:sam-cohen:claim:escape-resistance",
    institutionId: "hmmsa",
    survivorSlug: "sam-cohen",
    text: "Sam Cohen and Jacques escaped while assigned to railroad-track labor and joined the resistance.",
    topics: [
      "escape",
      "escaped",
      "jacques",
      "railroad",
      "forced labor",
      "resistance",
      "survive",
      "survival",
    ],
    sourceIds: ["hmmsa:source:survivors-experts"],
    evidenceLocator: "HMMSA survivor profile, Sam Cohen section",
    status: "curator-approved",
    recordKind: "historical-claim",
  },
  {
    id: "hmmsa:sam-cohen:claim:san-antonio-1951",
    institutionId: "hmmsa",
    survivorSlug: "sam-cohen",
    text: "Sam Cohen moved from Greece to San Antonio in 1951, where the Jewish Federation helped him obtain work as a bookkeeper.",
    topics: [
      "1951",
      "san antonio",
      "texas",
      "later life",
      "moved",
      "federation",
      "bookkeeper",
      "occupation",
      "work",
    ],
    sourceIds: ["hmmsa:source:survivors-experts"],
    evidenceLocator: "HMMSA survivor profile, Sam Cohen section",
    status: "curator-approved",
    recordKind: "historical-claim",
  },
];

const stephanClaims: SurvivorStudioClaim[] = [
  {
    id: "hmmsa:stephan-jalnos:claim:lodz-ghetto",
    institutionId: "hmmsa",
    survivorSlug: "stephan-jalnos",
    text: "HMMSA's Survivor Speakers Series describes Stephan Jalnos's story as beginning in the Łódź Ghetto in Poland.",
    topics: ["lodz", "łódź", "ghetto", "poland", "wartime", "story"],
    sourceIds: ["hmmsa:source:stephan-jalnos-speakers-series"],
    evidenceLocator: "HMMSA Survivor Speakers Series event description",
    status: "curator-approved",
    recordKind: "historical-claim",
  },
  {
    id: "hmmsa:stephan-jalnos:claim:resistance",
    institutionId: "hmmsa",
    survivorSlug: "stephan-jalnos",
    text: "The HMMSA event description says that Stephan Jalnos joined resistance fighters.",
    topics: ["resistance", "fighters", "joined", "survive", "survival"],
    sourceIds: ["hmmsa:source:stephan-jalnos-speakers-series"],
    evidenceLocator: "HMMSA Survivor Speakers Series event description",
    status: "curator-approved",
    recordKind: "historical-claim",
  },
  {
    id: "hmmsa:stephan-jalnos:claim:mauthausen",
    institutionId: "hmmsa",
    survivorSlug: "stephan-jalnos",
    text: "The approved HMMSA event description includes Mauthausen in Stephan Jalnos's survival story.",
    topics: ["mauthausen", "camp", "survive", "survival", "wartime"],
    sourceIds: ["hmmsa:source:stephan-jalnos-speakers-series"],
    evidenceLocator: "HMMSA Survivor Speakers Series event description",
    status: "curator-approved",
    recordKind: "historical-claim",
  },
  {
    id: "hmmsa:stephan-jalnos:claim:robi-presenter",
    institutionId: "hmmsa",
    survivorSlug: "stephan-jalnos",
    text: "Stephan Jalnos's story was shared in the HMMSA program by his son, Robi Jalnos.",
    topics: ["robi", "son", "descendant", "shared", "presented", "speaker", "story"],
    sourceIds: ["hmmsa:source:stephan-jalnos-speakers-series"],
    evidenceLocator: "HMMSA Survivor Speakers Series event description",
    status: "curator-approved",
    recordKind: "historical-claim",
  },
];

const samGaps: SurvivorStudioEvidenceGap[] = [
  {
    id: "hmmsa:sam-cohen:gap:birth-year",
    institutionId: "hmmsa",
    survivorSlug: "sam-cohen",
    field: "birth_year",
    statement: "The approved studio sources do not establish Sam Cohen's birth year.",
    searchTerms: ["born", "birth", "birth year", "what year"],
    status: "not-established-in-approved-record",
  },
  {
    id: "hmmsa:sam-cohen:gap:birth-place",
    institutionId: "hmmsa",
    survivorSlug: "sam-cohen",
    field: "birth_place",
    statement:
      "The approved studio sources identify where Sam Cohen grew up, but they do not establish his birthplace.",
    searchTerms: ["born", "birth", "birthplace", "birth place", "where born"],
    status: "not-established-in-approved-record",
  },
  {
    id: "hmmsa:sam-cohen:gap:parents",
    institutionId: "hmmsa",
    survivorSlug: "sam-cohen",
    field: "parents",
    statement: "The approved studio sources do not identify Sam Cohen's parents.",
    searchTerms: ["parent", "parents", "mother", "father"],
    status: "not-established-in-approved-record",
  },
];

const stephanGaps: SurvivorStudioEvidenceGap[] = [
  {
    id: "hmmsa:stephan-jalnos:gap:birth-year",
    institutionId: "hmmsa",
    survivorSlug: "stephan-jalnos",
    field: "birth_year",
    statement: "The approved studio sources do not establish Stephan Jalnos's birth year.",
    searchTerms: ["born", "birth", "birth year", "what year", "age"],
    status: "not-established-in-approved-record",
  },
  {
    id: "hmmsa:stephan-jalnos:gap:birth-place",
    institutionId: "hmmsa",
    survivorSlug: "stephan-jalnos",
    field: "birth_place",
    statement:
      "The approved studio sources do not establish Stephan Jalnos's birthplace; the reference to the Łódź Ghetto must not be treated as a birthplace.",
    searchTerms: ["born", "birth", "birthplace", "birth place", "where born"],
    status: "not-established-in-approved-record",
  },
  {
    id: "hmmsa:stephan-jalnos:gap:parents",
    institutionId: "hmmsa",
    survivorSlug: "stephan-jalnos",
    field: "parents",
    statement: "The approved studio sources do not identify Stephan Jalnos's mother or father.",
    searchTerms: ["parent", "parents", "mother", "father", "mom", "dad"],
    status: "not-established-in-approved-record",
  },
  {
    id: "hmmsa:stephan-jalnos:gap:prewar-family-occupation",
    institutionId: "hmmsa",
    survivorSlug: "stephan-jalnos",
    field: "prewar_family_occupation",
    statement:
      "The approved studio sources do not establish Stephan Jalnos's prewar family occupation.",
    searchTerms: [
      "occupation",
      "profession",
      "job",
      "work",
      "family business",
      "family do",
      "parents do",
      "mother do",
      "father do",
      "livelihood",
      "prewar",
    ],
    status: "not-established-in-approved-record",
  },
];

const samChapters: SurvivorStudioChapterPlan[] = [
  {
    id: "hmmsa:sam-cohen:chapter:salonika",
    institutionId: "hmmsa",
    survivorSlug: "sam-cohen",
    workingTitle: "A childhood in Salonika",
    purpose: "Gather approved place and early-life evidence before drafting.",
    claimIds: ["hmmsa:sam-cohen:claim:salonika-childhood"],
    openQuestionIds: [
      "hmmsa:sam-cohen:gap:birth-year",
      "hmmsa:sam-cohen:gap:birth-place",
      "hmmsa:sam-cohen:gap:parents",
    ],
    recordKind: "synthetic-organizational-metadata",
  },
  {
    id: "hmmsa:sam-cohen:chapter:war-resistance",
    institutionId: "hmmsa",
    survivorSlug: "sam-cohen",
    workingTitle: "Ghetto, forced labor, and resistance",
    purpose: "Keep the wartime chronology tied to approved claim records.",
    claimIds: [
      "hmmsa:sam-cohen:claim:ghetto-1943",
      "hmmsa:sam-cohen:claim:escape-resistance",
    ],
    openQuestionIds: [],
    recordKind: "synthetic-organizational-metadata",
  },
  {
    id: "hmmsa:sam-cohen:chapter:san-antonio",
    institutionId: "hmmsa",
    survivorSlug: "sam-cohen",
    workingTitle: "Building a life in San Antonio",
    purpose: "Organize approved postwar evidence for a later-life chapter.",
    claimIds: ["hmmsa:sam-cohen:claim:san-antonio-1951"],
    openQuestionIds: [],
    recordKind: "synthetic-organizational-metadata",
  },
];

const stephanChapters: SurvivorStudioChapterPlan[] = [
  {
    id: "hmmsa:stephan-jalnos:chapter:before-war",
    institutionId: "hmmsa",
    survivorSlug: "stephan-jalnos",
    workingTitle: "Before the Łódź Ghetto — research needed",
    purpose: "Hold unresolved biographical questions without drafting unsupported facts.",
    claimIds: [],
    openQuestionIds: stephanGaps.map((gap) => gap.id),
    recordKind: "synthetic-organizational-metadata",
  },
  {
    id: "hmmsa:stephan-jalnos:chapter:ghetto-resistance",
    institutionId: "hmmsa",
    survivorSlug: "stephan-jalnos",
    workingTitle: "Łódź and resistance",
    purpose: "Arrange the approved wartime claims while further sourcing is reviewed.",
    claimIds: [
      "hmmsa:stephan-jalnos:claim:lodz-ghetto",
      "hmmsa:stephan-jalnos:claim:resistance",
    ],
    openQuestionIds: [],
    recordKind: "synthetic-organizational-metadata",
  },
  {
    id: "hmmsa:stephan-jalnos:chapter:mauthausen-legacy",
    institutionId: "hmmsa",
    survivorSlug: "stephan-jalnos",
    workingTitle: "Mauthausen and a story carried forward",
    purpose: "Connect approved camp and descendant-presentation evidence without inventing detail.",
    claimIds: [
      "hmmsa:stephan-jalnos:claim:mauthausen",
      "hmmsa:stephan-jalnos:claim:robi-presenter",
    ],
    openQuestionIds: [],
    recordKind: "synthetic-organizational-metadata",
  },
];

const hmmsa: SurvivorStudioInstitution = {
  id: "hmmsa",
  name: "The Holocaust Memorial Museum of San Antonio",
  shortName: "HMMSA",
  sources: hmmsaSources,
  profiles: [
    {
      institutionId: "hmmsa",
      survivorSlug: "sam-cohen",
      displayName: "Sam Cohen",
      historicalClaims: samClaims,
      evidenceGaps: samGaps,
      bookOrganization: {
        recordKind: "synthetic-organizational-metadata",
        notice:
          "These chapter labels and groupings are synthetic demo organization for Robin's writing workflow; they are not historical claims or publication-ready prose.",
        chapters: samChapters,
      },
      personaGuardrails: sharedGuardrails,
    },
    {
      institutionId: "hmmsa",
      survivorSlug: "stephan-jalnos",
      displayName: "Stephan Jalnos",
      historicalClaims: stephanClaims,
      evidenceGaps: stephanGaps,
      bookOrganization: {
        recordKind: "synthetic-organizational-metadata",
        notice:
          "These chapter labels and groupings are synthetic demo organization for Robin's writing workflow; they are not historical claims or publication-ready prose.",
        chapters: stephanChapters,
      },
      personaGuardrails: sharedGuardrails,
    },
  ],
};

export const SURVIVOR_STUDIO_INSTITUTIONS: Record<
  SurvivorStudioInstitutionId,
  SurvivorStudioInstitution
> = { hmmsa };

export function getSurvivorStudioInstitution(
  institutionId: SurvivorStudioInstitutionId,
): SurvivorStudioInstitution {
  return SURVIVOR_STUDIO_INSTITUTIONS[institutionId];
}

export function getSurvivorStudioProfile(
  institutionId: SurvivorStudioInstitutionId,
  survivorSlug: SurvivorStudioSurvivorSlug,
): SurvivorStudioProfile {
  const profile = getSurvivorStudioInstitution(institutionId).profiles.find(
    (candidate) => candidate.survivorSlug === survivorSlug,
  );
  if (!profile) throw new Error("Survivor Studio profile was not found.");
  return profile;
}

export function hasSurvivorStudioProfile(
  institutionId: SurvivorStudioInstitutionId,
  survivorSlug: SurvivorStudioSurvivorSlug,
): boolean {
  return getSurvivorStudioInstitution(institutionId).profiles.some(
    (profile) => profile.survivorSlug === survivorSlug,
  );
}

export function getSurvivorStudioSource(
  institutionId: SurvivorStudioInstitutionId,
  sourceId: string,
): SurvivorStudioSource | undefined {
  return getSurvivorStudioInstitution(institutionId).sources.find(
    (source) => source.id === sourceId && source.institutionId === institutionId,
  );
}
