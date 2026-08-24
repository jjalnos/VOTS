import type { Actor } from "@/lib/auth/policy";
import type { Locale } from "@/lib/domain/types";

/**
 * A destination in the private workspace.
 *
 * `status` is the difference between a page a curator can use today and one
 * the committee has only promised. A "planned" entry is shown so the shape of
 * the work is visible, but it does not link anywhere — an archive that sends
 * someone to a demonstration screen and calls it a feature teaches them to
 * distrust the rest of it.
 */
export type WorkspaceStatus = "ready" | "planned";

export interface WorkspaceLink {
  label: string;
  href: string | null;
  status: WorkspaceStatus;
  /** Chooses the icon drawn beside the label in the sidebar. */
  icon: WorkspaceIcon;
}

export type WorkspaceIcon =
  | "people"
  | "inbox"
  | "studio"
  | "register"
  | "review"
  | "research"
  | "publish"
  | "upload"
  | "access"
  | "security";

export interface WorkspaceGroup {
  label: string;
  links: WorkspaceLink[];
}

const READY = "ready" as const;
const PLANNED = "planned" as const;

/**
 * The private destinations a signed-in person may reach, grouped for the
 * workspace sidebar and ordered the way the work actually runs: hold the
 * record, take material in, decide what is true, then publish it.
 */
export function workspaceGroupsFor(actor: Actor | null, locale: Locale): WorkspaceGroup[] {
  if (!actor) return [];
  const es = locale === "es";
  const roles = actor.roles;
  const curator = roles.includes("curator");
  const admin = roles.includes("admin");
  const groups: WorkspaceGroup[] = [];

  // Everything that touches the collection lives under one heading, in the
  // order the work runs: hold the record, take material in, decide what is
  // true, then publish it.
  const archive: WorkspaceLink[] = [
    { label: es ? "Sobrevivientes" : "Survivors", href: "/curator/survivors", status: READY, icon: "people" },
  ];
  if (curator) {
    archive.push(
      { label: es ? "Registro de cargas" : "Upload register", href: "/curator/archive", status: READY, icon: "register" },
    );
  }
  if (roles.includes("family") || admin) {
    archive.push(
      { label: es ? "Cargar al archivo" : "Archive upload", href: "/upload", status: READY, icon: "upload" },
    );
  }
  if (curator) {
    archive.push(
      { label: es ? "Revisar" : "Review", href: "/curator/review", status: READY, icon: "review" },
      { label: es ? "Investigación pagada" : "Paid research", href: "/curator/research", status: READY, icon: "research" },
      { label: es ? "Publicar" : "Publish", href: "/curator/publish", status: READY, icon: "publish" },
    );
  }
  // Promised, not built. Shown to anyone who runs the archive so the shape of
  // the work is visible, and deliberately linking nowhere.
  if (curator || admin) {
    archive.push(
      { label: es ? "Ingreso al archivo" : "Archive intake", href: null, status: PLANNED, icon: "inbox" },
      { label: es ? "Estudio" : "Studio", href: null, status: PLANNED, icon: "studio" },
    );
  }
  groups.push({ label: es ? "El archivo" : "The Archive", links: archive });

  const administration: WorkspaceLink[] = [];
  if (admin) {
    administration.push({
      label: es ? "Acceso y políticas" : "Access & policy",
      href: "/admin/access",
      status: READY,
      icon: "access",
    });
  }
  administration.push({
    label: es ? "Seguridad" : "Security",
    href: "/account/security",
    status: READY,
    icon: "security",
  });
  groups.push({ label: es ? "Administración" : "Administration", links: administration });

  return groups;
}

/** Flat list of reachable destinations, for shells that cannot show groups. */
export function workspaceLinksFor(actor: Actor | null, locale: Locale): string[][] {
  return workspaceGroupsFor(actor, locale)
    .flatMap((group) => group.links)
    .filter((link) => link.href !== null)
    .map((link) => [link.label, link.href as string]);
}

/**
 * The workspace's front door for a signed-in person: the registry for anyone
 * who works the archive, access control for a pure administrator, the upload
 * page for an invited family contributor. Public pages show one quiet button
 * to this destination instead of a strip of every private route.
 */
export function workspaceHomeFor(actor: Actor | null): string | null {
  if (!actor) return null;
  if (actor.roles.includes("curator") || actor.roles.includes("viewer")) {
    return "/curator/survivors";
  }
  if (actor.roles.includes("admin")) return "/admin/access";
  if (actor.roles.includes("family")) return "/upload";
  return null;
}
