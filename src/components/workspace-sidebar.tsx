import Link from "next/link";
import type { Actor } from "@/lib/auth/policy";
import type { Locale } from "@/lib/domain/types";
import { LogoutButton } from "@/components/logout-button";
import { WorkspaceIconMark } from "@/components/workspace-icon";
import { workspaceGroupsFor } from "@/lib/auth/workspace-links";
import { withLocale } from "@/lib/i18n";

/**
 * The workspace's own navigation: grouped, always visible down the left, and
 * honest about which pages exist. A planned destination is rendered as text,
 * not a link, so it cannot be clicked into a demonstration and mistaken for a
 * working feature.
 */
export function WorkspaceSidebar({
  actor,
  locale,
  path,
}: {
  actor: Actor;
  locale: Locale;
  path: string;
}) {
  const groups = workspaceGroupsFor(actor, locale);
  const es = locale === "es";

  return (
    <nav
      className="workspace-sidebar"
      aria-label={es ? "Navegación del espacio privado" : "Workspace navigation"}
    >
      <Link className="workspace-brand" href={withLocale("/", locale)}>
        <span className="workspace-brand-name">Voices of the Shoah</span>
        <span className="workspace-brand-role">{es ? "Espacio privado" : "Workspace"}</span>
      </Link>

      <div className="workspace-nav-scroll">
        {groups.map((group) => (
          <div className="workspace-group" key={group.label}>
            <p className="workspace-group-label">{group.label}</p>
            <ul>
              {group.links.map((link) => {
                if (link.href === null) {
                  return (
                    <li key={link.label}>
                      <span className="workspace-item is-planned" aria-disabled="true">
                        <WorkspaceIconMark name={link.icon} />
                        <span className="workspace-item-label">{link.label}</span>
                        <span className="workspace-planned-tag">
                          {es ? "Pendiente" : "Not built"}
                        </span>
                      </span>
                    </li>
                  );
                }
                const current = path === link.href;
                return (
                  <li key={link.href}>
                    <Link
                      className={`workspace-item${current ? " is-current" : ""}`}
                      href={withLocale(link.href, locale)}
                      aria-current={current ? "page" : undefined}
                    >
                      <WorkspaceIconMark name={link.icon} />
                      <span className="workspace-item-label">{link.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="workspace-sidebar-foot">
        <Link className="workspace-foot-link" href={withLocale("/", locale)}>
          {es ? "Ver el archivo público" : "View the public archive"}
        </Link>
        <div className="workspace-foot-row">
          <span className="workspace-actor" title={actor.email}>
            {actor.displayName || actor.email}
          </span>
          <LogoutButton locale={locale} />
        </div>
      </div>
    </nav>
  );
}
