"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export default function AuthLogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function logout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("تعذّر تسجيل الخروج.");
      router.replace("/login");
      router.refresh();
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : "تعذّر تسجيل الخروج.");
      setIsLoggingOut(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={logout} disabled={isLoggingOut} aria-label={compact ? "تسجيل الخروج" : undefined} className={compact
        ? "grid size-10 place-items-center rounded-xl border border-[#e9e7e0] bg-white text-[#8b625d] hover:bg-[#fff3f0] disabled:opacity-60"
        : "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-[#8b625d] hover:bg-[#fff3f0] disabled:opacity-60"}>
        <LogOut size={15} />
        {!compact ? isLoggingOut ? "جارٍ تسجيل الخروج..." : "تسجيل الخروج" : null}
      </button>
      {error ? <p role="alert" className={`${compact ? "absolute left-4 top-14" : "px-3 pt-1"} text-[10px] text-[#a44f46]`}>{error}</p> : null}
    </div>
  );
}
