import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "HMMSA Digital Archive",
    template: "%s | HMMSA Digital Archive",
  },
  description:
    "A bilingual, curator-reviewed digital archive foundation for The Holocaust Memorial Museum of San Antonio.",
  applicationName: "HMMSA Digital Archive",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  openGraph: {
    type: "website",
    title: "HMMSA Digital Archive",
    description:
      "Published survivor and family stories, timelines, sources, and a cited archive guide.",
  },
  robots:
    process.env.NEXT_PUBLIC_COMING_SOON !== "false"
      ? { index: false, follow: false }
      : { index: true, follow: true },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#4f0908",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content / Ir al contenido
        </a>
        {children}
      </body>
    </html>
  );
}
