export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { runApplicationStartup } = await import("@/lib/startup");
  await runApplicationStartup();
}
