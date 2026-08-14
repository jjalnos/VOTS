import type { Metadata } from "next";
import { RobinDemo } from "@/components/robin-demo";

export const metadata: Metadata = {
  title: "Robin’s Private Archive Demo",
  description:
    "A private, synthetic demonstration of the Voices curatorial workspace, archive assistant, upload library, and source review flow.",
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

export default function RobinDemoPage() {
  return <RobinDemo />;
}
