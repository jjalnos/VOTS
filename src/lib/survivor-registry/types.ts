export const REGISTRY_GENERATIONS = [
  "survivor",
  "survivor-spouse",
  "2nd-gen",
  "2nd-gen-spouse",
  "3rd-gen",
  "3rd-gen-spouse",
  "4th-gen",
  "4th-gen-spouse",
  "indirect",
  "indirect-spouse",
  "contact",
  "unclassified",
] as const;

export type RegistryGeneration = (typeof REGISTRY_GENERATIONS)[number];

export interface RegistryPerson {
  id: string;
  firstName: string;
  lastName: string;
  title: string;
  generation: RegistryGeneration;
  /** Robin's original label from the workbook, preserved verbatim. */
  generationRaw: string;
  /** Free-text parent/grandparent reference exactly as Robin recorded it. */
  familyThread: string;
  /** Grouping key: the survivor surname when linkable, else the thread text. */
  familyKey: string;
  countryOfOrigin: string;
  dateOfBirth: string;
  dateOfDeath: string;
  camps: string[];
  fateNotes: string[];
  address: string;
  city: string;
  state: string;
  zip: string;
  email: string;
  phone: string;
  deceased: boolean;
  /** How the deceased mark was detected on import (red-font, asterisk, …). */
  deceasedSource: string;
  notes: string;
  source: "workbook-import" | "curator";
  createdAt: string;
  updatedAt: string;
}

export interface RegistryListInput {
  query: string;
  generation: RegistryGeneration | "all";
  family: string | "all";
  status: "all" | "living" | "deceased";
  page: number;
  pageSize: number;
}

export interface RegistryFacets {
  generations: Array<{ value: RegistryGeneration; count: number }>;
  families: Array<{ value: string; count: number }>;
  deceased: number;
  living: number;
}

export interface RegistryListResult {
  items: RegistryPerson[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  facets: RegistryFacets;
}

/** Fields a curator may set when creating or editing a person. */
export interface RegistryPersonInput {
  firstName: string;
  lastName: string;
  title: string;
  generation: RegistryGeneration;
  familyThread: string;
  countryOfOrigin: string;
  dateOfBirth: string;
  dateOfDeath: string;
  camps: string[];
  fateNotes: string[];
  address: string;
  city: string;
  state: string;
  zip: string;
  email: string;
  phone: string;
  deceased: boolean;
  notes: string;
}
