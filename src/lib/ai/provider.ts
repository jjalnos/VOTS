// Compatibility exports. Internal routes import `internal-provider` directly,
// while the external research route imports `external-governance`. There is no
// ungoverned external-provider compatibility export.
export { getInternalArchiveAIProvider } from "@/lib/ai/internal-provider";
