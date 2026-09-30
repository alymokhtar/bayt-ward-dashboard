import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, LayoutDashboard } from "lucide-react";

type RoutePlaceholderProps = {
  title: string;
  description: string;
  icon: LucideIcon;
};

export default function RoutePlaceholder({ title, description, icon: Icon }: RoutePlaceholderProps) {
  return (
    <main className="min-h-screen bg-[#f7f7f4] px-4 py-8 text-[#283630] sm:px-7 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="inline-flex items-center gap-2 rounded-xl border border-[#e9e7e0] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#53645a] transition hover:border-[#cbd8cd]">
          <ArrowRight size={15} /> العودة إلى لوحة التحكم
        </Link>
        <section className="mt-7 overflow-hidden rounded-[24px] border border-[#ece9e2] bg-white shadow-[0_8px_36px_rgba(42,53,44,0.05)] sm:mt-10">
          <div className="h-2 bg-gradient-to-l from-[#d9b895] via-[#8eab8c] to-[#215b4e]" />
          <div className="px-6 py-10 text-center sm:px-12 sm:py-16">
            <span className="mx-auto grid size-16 place-items-center rounded-[20px] bg-[#edf4ef] text-[#256052]"><Icon size={27} strokeWidth={1.7} /></span>
            <h1 className="mt-5 text-2xl font-bold text-[#273a31]">{title}</h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-[#898f87]">{description}</p>
            <span className="mt-5 inline-flex rounded-full bg-[#f7f4ed] px-3 py-1.5 text-[11px] font-semibold text-[#8c754a]">قيد التجهيز</span>
            <div className="mt-7">
              <Link href="/" className="inline-flex items-center gap-2 rounded-xl bg-[#205c4e] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#184d41]"><LayoutDashboard size={16} /> العودة للرئيسية</Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
