import type { Metadata } from "next";
import { ArchiveIntake } from "@/components/archive-intake";
import { requireAction } from "@/lib/auth/server-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Robin’s Archive Intake & Library",
  description:
    "A private demonstration of batch archival intake, rights-aware metadata, and searchable collection review.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default async function RobinArchivePage() {
  await requireAction("view_archive_workspace", "/demo/robin/archive");
  return <ArchiveIntake />;
}
