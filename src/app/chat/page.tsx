import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChatExperience } from "@/components/chat-experience";
import { WorkspaceShell } from "@/components/workspace-shell";
import { evaluateSusanneOwnerAccess } from "@/lib/ai/susanne-access";
import { requireAction } from "@/lib/auth/server-session";
import { localeFrom } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Private listening room · Susanne “Zsuzsi” Weisz Jalnos",
  description: "Authentic published testimony and a private, testimony-grounded archival guide.",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default async function ChatPage({ searchParams }: PageProps<"/chat">) {
  const locale = localeFrom((await searchParams).lang);
  const returnTo = locale === "es" ? "/chat?lang=es" : "/chat";
  const actor = await requireAction("manage_access", returnTo);

  // This room is deliberately narrower than the admin role. Reuse the same
  // fail-closed owner check enforced by both private API routes.
  const authorization = evaluateSusanneOwnerAccess(
    actor,
    process.env.SUSANNE_OWNER_EMAIL,
  );
  if (!authorization.ok) redirect("/unauthorized");

  return (
    <WorkspaceShell
      actor={actor}
      locale={locale}
      path="/chat"
      title="Susanne “Zsuzsi” Weisz Jalnos"
      description={
        locale === "es"
          ? "Sala privada para escuchar su testimonio auténtico y conversar directamente con una guía de archivo factual."
          : "A private room for her authentic testimony and a direct, fact-focused conversation with the archival guide."
      }
    >
      <ChatExperience locale={locale} />
    </WorkspaceShell>
  );
}
