export function StatusPill({ children, tone = "approved" }: { children: React.ReactNode; tone?: "approved" | "pending" | "private" }) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}
