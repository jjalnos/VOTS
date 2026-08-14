import type {
  ArchiveItem,
  Family,
  PublicRelease,
  Relationship,
  Source,
  Story,
  Survivor,
  TimelineEvent,
  User,
} from "@/lib/domain/types";

const now = "2026-08-13T00:00:00.000Z";

export const seedUsers: User[] = [
  {
    id: "user-admin-demo",
    email: "admin@archive.local",
    displayName: "Development Administrator",
    roles: ["admin"],
    mfaRequired: true,
    active: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "user-curator-demo",
    email: "curator@archive.local",
    displayName: "Development Curator",
    roles: ["curator"],
    mfaRequired: true,
    active: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "user-family-demo",
    email: "family@archive.local",
    displayName: "Invited Family Contributor",
    roles: ["family"],
    familyId: "family-demo",
    mfaRequired: false,
    active: true,
    createdAt: now,
    updatedAt: now,
  },
];

export const seedFamilies: Family[] = [
  {
    id: "family-demo",
    name: "Demonstration family group",
    invitationOnly: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "family-private-control",
    name: "Private isolation test group",
    invitationOnly: true,
    createdAt: now,
    updatedAt: now,
  },
];

export const seedSurvivors: Survivor[] = [
  {
    id: "survivor-demo-published",
    slug: "demonstration-profile",
    familyId: "family-demo",
    displayName: {
      en: "Demonstration profile",
      es: "Perfil de demostración",
    },
    summary: {
      en: "This neutral record demonstrates how a curator-approved profile will present translated text, rights notes, and citations.",
      es: "Este registro neutral demuestra cómo un perfil aprobado por curaduría presentará texto traducido, notas de derechos y citas.",
    },
    originalLanguage: "en",
    reviewStatus: "approved",
    isDemonstration: true,
    createdBy: "user-curator-demo",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "survivor-private-draft",
    slug: "private-draft-never-public",
    familyId: "family-private-control",
    displayName: {
      en: "PRIVATE TEST RECORD",
      es: "REGISTRO PRIVADO DE PRUEBA",
    },
    summary: {
      en: "This sentinel content must never appear in public views or chat.",
      es: "Este contenido centinela nunca debe aparecer en vistas públicas ni en el chat.",
    },
    originalLanguage: "en",
    reviewStatus: "pending",
    isDemonstration: true,
    createdBy: "user-curator-demo",
    createdAt: now,
    updatedAt: now,
  },
];

export const seedRelationships: Relationship[] = [
  {
    id: "relationship-demo",
    familyId: "family-demo",
    survivorId: "survivor-demo-published",
    relatedUserId: "user-family-demo",
    relationshipLabel: { en: "Invited contributor", es: "Colaborador invitado" },
    reviewStatus: "approved",
    createdBy: "user-curator-demo",
    createdAt: now,
  },
];

export const seedSources: Source[] = [
  {
    id: "source-hmmsa-archive-policy",
    title: "HMMSA Digital Archive demonstration record",
    publisher: "The Holocaust Memorial Museum of San Antonio",
    url: "https://www.hmmsa.org/",
    citation: {
      en: "HMMSA Digital Archive, demonstration record. Museum review required before publication.",
      es: "Archivo Digital de HMMSA, registro de demostración. Se requiere revisión del museo antes de publicar.",
    },
    approvalStatus: "approved",
    approvedBy: "user-curator-demo",
    approvedAt: now,
    createdAt: now,
  },
  {
    id: "source-private-unapproved",
    title: "PRIVATE UNAPPROVED SOURCE",
    publisher: "Unapproved",
    citation: {
      en: "Never public.",
      es: "Nunca público.",
    },
    approvalStatus: "pending",
    createdAt: now,
  },
];

export const seedArchiveItems: ArchiveItem[] = [
  {
    id: "archive-item-demo-published",
    survivorId: "survivor-demo-published",
    familyId: "family-demo",
    title: "Demonstration catalog card",
    itemType: "document",
    sourceContributor: "Museum development fixture",
    originalLanguage: "en",
    consentRights: "owned",
    rightsStatement: "Demonstration-only fixture; no personal media is included.",
    visibility: "public",
    reviewStatus: "approved",
    uploadedBy: "user-curator-demo",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "archive-item-private-sentinel",
    survivorId: "survivor-private-draft",
    familyId: "family-private-control",
    title: "PRIVATE UPLOAD SENTINEL",
    itemType: "document",
    sourceContributor: "Private contributor",
    originalLanguage: "en",
    consentRights: "documented_restriction",
    rightsStatement: "Private test content. Publication is prohibited.",
    visibility: "private",
    reviewStatus: "pending",
    uploadedBy: "user-curator-demo",
    createdAt: now,
    updatedAt: now,
  },
];

export const seedStories: Story[] = [
  {
    id: "story-demo-published",
    slug: "how-publication-review-works",
    title: {
      en: "How publication review protects the archive",
      es: "Cómo la revisión de publicación protege el archivo",
    },
    dek: {
      en: "A demonstration of the archive's human review boundary.",
      es: "Una demostración del límite de revisión humana del archivo.",
    },
    body: {
      en: "Uploads remain private until a curator verifies source, rights, translation, and release details. This sample contains no survivor biography.",
      es: "Las cargas permanecen privadas hasta que una persona curadora verifica la fuente, los derechos, la traducción y los detalles de publicación. Esta muestra no contiene una biografía de sobreviviente.",
    },
    sourceIds: ["source-hmmsa-archive-policy"],
    reviewStatus: "approved",
    createdBy: "user-curator-demo",
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "story-private-sentinel",
    slug: "private-story",
    title: { en: "PRIVATE STORY SENTINEL", es: "HISTORIA PRIVADA CENTINELA" },
    dek: { en: "Never public", es: "Nunca público" },
    body: { en: "Never public", es: "Nunca público" },
    sourceIds: ["source-private-unapproved"],
    reviewStatus: "pending",
    createdBy: "user-curator-demo",
    createdAt: now,
    updatedAt: now,
  },
];

export const seedTimelineEvents: TimelineEvent[] = [
  {
    id: "timeline-demo-published",
    dateLabel: { en: "Curator date pending", es: "Fecha curatorial pendiente" },
    title: { en: "Demonstration timeline entry", es: "Entrada de cronología de demostración" },
    description: {
      en: "A sourced historical event will replace this placeholder after museum review.",
      es: "Un acontecimiento histórico con fuentes reemplazará este marcador después de la revisión del museo.",
    },
    sourceIds: ["source-hmmsa-archive-policy"],
    reviewStatus: "approved",
    createdBy: "user-curator-demo",
    createdAt: now,
    updatedAt: now,
  },
];

export const seedPublicReleases: PublicRelease[] = [
  {
    id: "release-survivor-demo-en",
    entityType: "survivor",
    entityId: "survivor-demo-published",
    locale: "en",
    status: "published",
    sourceIds: ["source-hmmsa-archive-policy"],
    rightsSnapshot: "Demonstration content only.",
    publishedBy: "user-curator-demo",
    publishedAt: now,
  },
  {
    id: "release-survivor-demo-es",
    entityType: "survivor",
    entityId: "survivor-demo-published",
    locale: "es",
    status: "published",
    sourceIds: ["source-hmmsa-archive-policy"],
    rightsSnapshot: "Contenido de demostración únicamente.",
    publishedBy: "user-curator-demo",
    publishedAt: now,
  },
  {
    id: "release-item-demo-en",
    entityType: "archive_item",
    entityId: "archive-item-demo-published",
    locale: "en",
    status: "published",
    sourceIds: ["source-hmmsa-archive-policy"],
    rightsSnapshot: "Demonstration content only.",
    publishedBy: "user-curator-demo",
    publishedAt: now,
  },
  {
    id: "release-story-demo-en",
    entityType: "story",
    entityId: "story-demo-published",
    locale: "en",
    status: "published",
    sourceIds: ["source-hmmsa-archive-policy"],
    rightsSnapshot: "Demonstration content only.",
    publishedBy: "user-curator-demo",
    publishedAt: now,
  },
  {
    id: "release-story-demo-es",
    entityType: "story",
    entityId: "story-demo-published",
    locale: "es",
    status: "published",
    sourceIds: ["source-hmmsa-archive-policy"],
    rightsSnapshot: "Contenido de demostración únicamente.",
    publishedBy: "user-curator-demo",
    publishedAt: now,
  },
  {
    id: "release-timeline-demo-en",
    entityType: "timeline_event",
    entityId: "timeline-demo-published",
    locale: "en",
    status: "published",
    sourceIds: ["source-hmmsa-archive-policy"],
    rightsSnapshot: "Demonstration content only.",
    publishedBy: "user-curator-demo",
    publishedAt: now,
  },
  {
    id: "release-timeline-demo-es",
    entityType: "timeline_event",
    entityId: "timeline-demo-published",
    locale: "es",
    status: "published",
    sourceIds: ["source-hmmsa-archive-policy"],
    rightsSnapshot: "Contenido de demostración únicamente.",
    publishedBy: "user-curator-demo",
    publishedAt: now,
  },
];
