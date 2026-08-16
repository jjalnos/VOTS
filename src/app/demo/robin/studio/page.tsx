import type { Metadata } from "next";
import { SurvivorStudio } from "@/components/survivor-studio";
import { requireAction } from "@/lib/auth/server-session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Robin’s Survivor Studio",
  description:
    "A private demonstration of an evidence-grounded research, archive, citation, manuscript, and survivor-guide workspace.",
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

export default async function SurvivorStudioPage() {
  await requireAction("view_archive_workspace", "/demo/robin/studio");
  return <SurvivorStudio />;
}
