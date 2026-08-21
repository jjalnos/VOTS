import type { Actor } from "@/lib/auth/policy";
import type { Locale } from "@/lib/domain/types";

/**
 * The private destinations a signed-in person may reach, in the order they are
 * shown. Both shells use this, so a curator sees the same workspace navigation
 * whether they are inside the workspace or reading a public page.
 */
export function workspaceLinksFor(actor: Actor | null, locale: Locale): string[][] {
  if (!actor) return [];
  const links: string[][] = [];
  const spanish = locale === "es";

  if (actor.roles.includes("viewer") && !actor.roles.includes("curator")) {
    links.push([spanish ? "Sobrevivientes" : "Survivors", "/curator/survivors"]);
  }
  if (actor.roles.includes("curator")) {
    links.push(
      [spanish ? "Sobrevivientes" : "Survivors", "/curator/survivors"],
      [spanish ? "Ingreso al archivo" : "Archive intake", "/demo/robin/archive"],
      [spanish ? "Estudio" : "Studio", "/demo/robin/studio"],
      [spanish ? "Registro de cargas" : "Upload register", "/curator/archive"],
      [spanish ? "Revisar" : "Review", "/curator/review"],
      [spanish ? "Investigación pagada" : "Paid research", "/curator/research"],
      [spanish ? "Publicar" : "Publish", "/curator/publish"],
    );
  }
  if (actor.roles.includes("family")) {
    links.push([spanish ? "Contribución familiar" : "Family contribution", "/family"]);
  }
  if (actor.roles.includes("admin")) {
    links.push([spanish ? "Acceso y políticas" : "Access & policy", "/admin/access"]);
  }
  links.push([spanish ? "Seguridad" : "Security", "/account/security"]);
  return links;
}
