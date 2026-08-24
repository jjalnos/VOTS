import type { WorkspaceIcon as IconName } from "@/lib/auth/workspace-links";

/**
 * Line icons for the workspace sidebar, drawn inline so the archive never
 * fetches an icon font from a third party.
 */
const PATHS: Record<IconName, string> = {
  people: "M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM1 17c0-3 2.7-5 6-5s6 2 6 5M15 17c0-2.3-1-4-2.6-4.6M13.5 8.4A3 3 0 0 0 13 2.6",
  inbox: "M2 11h4l1.2 2.4h4.6L13 11h4M2 11 4.6 3.6A1 1 0 0 1 5.6 3h6.8a1 1 0 0 1 1 .6L16 11v4.4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V11Z",
  studio: "M3 3h13v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3Zm0 3.6h13M6.6 17h6M9.6 13.5V17",
  register: "M4.5 2.5h8l3 3v12h-11v-15Zm8 0v3h3M7 9h6M7 12.2h6M7 15.4h3.5",
  review: "M2.2 9.5s2.7-5 7.3-5 7.3 5 7.3 5-2.7 5-7.3 5-7.3-5-7.3-5Zm7.3 2.1a2.1 2.1 0 1 0 0-4.2 2.1 2.1 0 0 0 0 4.2Z",
  research: "M8.6 14a5.4 5.4 0 1 0 0-10.8 5.4 5.4 0 0 0 0 10.8Zm4 .4L17 18.6",
  publish: "M9.6 2.6 3.4 9h3.4v8.2h5.6V9h3.4L9.6 2.6Z",
  upload: "M9.6 13V3.2m0 0L6 6.8m3.6-3.6 3.6 3.6M3 13.6v2.2a1 1 0 0 0 1 1h11.2a1 1 0 0 0 1-1v-2.2",
  access: "M9.6 2.4 3 5v5c0 4 2.8 6.7 6.6 7.8C13.4 16.7 16.2 14 16.2 10V5L9.6 2.4Zm0 5.4v4.4",
  security: "M5 8.6V6.4a4.6 4.6 0 0 1 9.2 0v2.2M3.8 8.6h11.6a1 1 0 0 1 1 1v6.4a1 1 0 0 1-1 1H3.8a1 1 0 0 1-1-1V9.6a1 1 0 0 1 1-1Z",
};

export function WorkspaceIconMark({ name }: { name: IconName }) {
  return (
    <svg
      className="workspace-icon"
      viewBox="0 0 19 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
