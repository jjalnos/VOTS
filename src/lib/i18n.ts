import { LOCALES, type Locale } from "@/lib/domain/types";

export const dictionary = {
  en: {
    archiveName: "Digital Archive",
    institutionName: "The Holocaust Memorial Museum of San Antonio",
    museumShort: "HMMSA",
    publicArchive: "Public archive",
    curatorReviewed: "Curator-reviewed",
    navHome: "Home",
    navDirectory: "Survivors",
    navStories: "Stories",
    navTimeline: "Timeline",
    navChat: "Ask the archive",
    navContribute: "Family contribution",
    navWorkspace: "Staff workspace",
    languageLabel: "Language",
    english: "English",
    spanish: "Español",
    onlyPublished: "Only museum-reviewed, published material appears here.",
    sourceRequired: "Every public statement must remain connected to an approved source.",
    demoNotice: "Demonstration content — not a real person or historical claim.",
    signIn: "Sign in",
    signOut: "Sign out",
    privateWorkspace: "Private archival workspace",
    skipToContent: "Skip to content",
  },
  es: {
    archiveName: "Archivo Digital",
    institutionName: "The Holocaust Memorial Museum of San Antonio",
    museumShort: "HMMSA",
    publicArchive: "Archivo público",
    curatorReviewed: "Revisado por curaduría",
    navHome: "Inicio",
    navDirectory: "Sobrevivientes",
    navStories: "Historias",
    navTimeline: "Línea de tiempo",
    navChat: "Consultar el archivo",
    navContribute: "Contribución familiar",
    navWorkspace: "Área de personal",
    languageLabel: "Idioma",
    english: "English",
    spanish: "Español",
    onlyPublished: "Aquí aparece solo material revisado y publicado por el museo.",
    sourceRequired: "Cada afirmación pública debe permanecer vinculada a una fuente aprobada.",
    demoNotice: "Contenido de demostración: no representa a una persona real ni una afirmación histórica.",
    signIn: "Iniciar sesión",
    signOut: "Cerrar sesión",
    privateWorkspace: "Espacio de archivo privado",
    skipToContent: "Ir al contenido",
  },
} as const;

export type DictionaryKey = keyof (typeof dictionary)["en"];

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALES.includes(value as Locale);
}

export function localeFrom(value: unknown): Locale {
  const candidate = Array.isArray(value) ? value[0] : value;
  return isLocale(candidate) ? candidate : "en";
}

export function t(locale: Locale, key: DictionaryKey): string {
  return dictionary[locale][key];
}

export function withLocale(path: string, locale: Locale): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}lang=${locale}`;
}
