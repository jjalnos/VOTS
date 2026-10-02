import { describe, expect, it } from "vitest";
import type { Actor } from "@/lib/auth/policy";
import { workspaceGroupsFor, workspaceLinksFor } from "@/lib/auth/workspace-links";

const admin: Actor = { userId: "admin", email: "admin@test", displayName: "Admin", roles: ["admin"], mfaVerified: true };
const curator: Actor = { ...admin, userId: "curator", roles: ["curator"] };
const viewer: Actor = { ...admin, userId: "viewer", roles: ["viewer"] };
const family: Actor = { ...admin, userId: "family", roles: ["family"], familyId: "family-demo" };

function hrefs(actor: Actor | null, locale: "en" | "es" = "en"): string[] {
  return workspaceLinksFor(actor, locale).map(([, href]) => href);
}

describe("email log navigation", () => {
  it("sits right after Communications for administrators", () => {
    const links = hrefs(admin);
    const communications = links.indexOf("/admin/communications");
    expect(communications).toBeGreaterThan(-1);
    expect(links[communications + 1]).toBe("/admin/email-log");
    expect(links.indexOf("/admin/access")).toBeLessThan(communications);
  });

  it("is labelled in both languages and drawn with the log icon", () => {
    expect(workspaceLinksFor(admin, "en")).toContainEqual(["Email log", "/admin/email-log"]);
    expect(workspaceLinksFor(admin, "es")).toContainEqual(["Registro de correo", "/admin/email-log"]);

    const administration = workspaceGroupsFor(admin, "en").find((group) => group.label === "Administration");
    const link = administration?.links.find((candidate) => candidate.href === "/admin/email-log");
    expect(link).toEqual({ label: "Email log", href: "/admin/email-log", status: "ready", icon: "log" });
  });

  it("is not offered to curators, viewers, families or anonymous visitors", () => {
    for (const actor of [curator, viewer, family, null]) {
      expect(hrefs(actor)).not.toContain("/admin/email-log");
      expect(hrefs(actor, "es")).not.toContain("/admin/email-log");
    }
    expect(workspaceLinksFor(null, "en")).toEqual([]);
  });
});
