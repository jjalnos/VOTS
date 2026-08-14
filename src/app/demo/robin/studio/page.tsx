import type { Metadata } from "next";
import { SurvivorStudio } from "@/components/survivor-studio";

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

export default function SurvivorStudioPage() {
  return <SurvivorStudio />;
}
