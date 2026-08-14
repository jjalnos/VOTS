"use client";

import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/domain/types";

export function LogoutButton({ locale }: { locale: Locale }) {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push(`/?lang=${locale}`);
    router.refresh();
  }
  return <button className="button ghost-light" type="button" onClick={logout}>{locale === "es" ? "Cerrar sesión" : "Sign out"}</button>;
}
