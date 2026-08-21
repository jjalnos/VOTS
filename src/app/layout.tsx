import type { Metadata, Viewport } from "next";
import { Archivo, Fraunces } from "next/font/google";
import "./globals.css";

/**
 * Fraunces speaks only for people: headings, names, and — once real
 * transcripts arrive — testimony. Archivo carries the interface.
 * next/font self-hosts both at build time; nothing loads from a CDN.
 */
const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz", "SOFT", "WONK"],
  variable: "--font-display",
  display: "swap",
});

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ui",
  display: "swap",
});

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
    <html lang="en" className={`${fraunces.variable} ${archivo.variable}`}>
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content / Ir al contenido
        </a>
        {children}
      </body>
    </html>
  );
}
