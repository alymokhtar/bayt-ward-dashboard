"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, LockKeyhole } from "lucide-react";

export default function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message = result && typeof result === "object" && "error" in result && typeof result.error === "string"
          ? result.error
          : "تعذّر تسجيل الدخول.";
        throw new Error(message);
      }
      router.replace(nextPath);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "تعذّر تسجيل الدخول.");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f7f4] px-4 text-[#283630]">
      <section className="w-full max-w-sm rounded-[22px] border border-[#ece9e2] bg-white p-6 shadow-[0_8px_35px_rgba(42,53,44,0.06)] sm:p-8">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#edf4ef] text-[#256052]">
          <LockKeyhole size={21} />
        </div>
        <h1 className="mt-5 text-center text-xl font-bold text-[#273a31]">دخول إدارة بيت ورد</h1>
        <p className="mt-2 text-center text-xs leading-6 text-[#8e928a]">أدخلي كلمة مرور الإدارة للوصول إلى لوحة التحكم.</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label htmlFor="admin-password" className="block text-xs font-semibold text-[#48534b]">كلمة المرور</label>
          <input
            id="admin-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            maxLength={1024}
            autoComplete="current-password"
            className="min-h-11 w-full rounded-xl border border-[#e9e8e1] bg-[#fdfdfb] px-3.5 py-2.5 text-sm outline-none focus:border-[#a3bba7] focus:ring-4 focus:ring-[#eaf1eb]"
          />
          {error ? <p role="alert" className="rounded-xl bg-[#fff5f2] px-3 py-2.5 text-xs leading-5 text-[#a44f46]">{error}</p> : null}
          <button
            type="submit"
            disabled={isSubmitting || !password}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#205c4e] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#184d41] disabled:cursor-wait disabled:opacity-60"
          >
            {isSubmitting ? <LoaderCircle size={17} className="animate-spin" /> : null}
            {isSubmitting ? "جارٍ التحقق..." : "تسجيل الدخول"}
          </button>
        </form>
      </section>
    </main>
  );
}
