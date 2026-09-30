"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  CircleHelp,
  Cloud,
  Eye,
  EyeOff,
  Hash,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  Palette,
  Save,
  Settings2,
  ShieldCheck,
  Store,
  WandSparkles,
  X,
} from "lucide-react";

type SettingsClientProps = {
  cloudinaryConfigured: boolean;
};

type SavedSettings = {
  storeName: string;
  defaultHashtags: string;
  facebookPageId: string;
  instagramAccountId: string;
  tiktokAccountId: string;
};

const DEFAULT_SETTINGS: SavedSettings = {
  storeName: "بيت ورد",
  defaultHashtags: "#بيت_ورد #تنسيق_زهور",
  facebookPageId: "",
  instagramAccountId: "",
  tiktokAccountId: "",
};

const SETTINGS_SECTIONS = [
  { id: "store", title: "إعدادات المتجر", icon: Store },
  { id: "platforms", title: "ربط المنصات", icon: KeyRound },
  { id: "cloudinary", title: "التخزين السحابي", icon: Cloud },
  { id: "appearance", title: "تفضيلات المظهر", icon: Palette },
];

export default function SettingsClient({ cloudinaryConfigured }: SettingsClientProps) {
  const [settings, setSettings] = useState<SavedSettings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [facebookAccessToken, setFacebookAccessToken] = useState("");
  const [showAccessToken, setShowAccessToken] = useState(false);
  const [toast, setToast] = useState("");
  const [toastIsError, setToastIsError] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/settings", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result: unknown = await response.json();
        if (!response.ok) {
          const message = result && typeof result === "object" && "error" in result && typeof result.error === "string"
            ? result.error
            : "تعذّر تحميل الإعدادات من قاعدة البيانات.";
          throw new Error(message);
        }

        const values = result && typeof result === "object" ? result as Partial<SavedSettings> : {};
        setSettings({
          storeName: typeof values.storeName === "string" ? values.storeName : DEFAULT_SETTINGS.storeName,
          defaultHashtags: typeof values.defaultHashtags === "string" ? values.defaultHashtags : DEFAULT_SETTINGS.defaultHashtags,
          facebookPageId: typeof values.facebookPageId === "string" ? values.facebookPageId : "",
          instagramAccountId: typeof values.instagramAccountId === "string" ? values.instagramAccountId : "",
          tiktokAccountId: typeof values.tiktokAccountId === "string" ? values.tiktokAccountId : "",
        });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setSettingsError(error instanceof Error ? error.message : "تعذّر تحميل الإعدادات من قاعدة البيانات.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setSettingsLoaded(true);
      });

    return () => {
      controller.abort();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  function updateSetting<K extends keyof SavedSettings>(key: K, value: SavedSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;

    setIsSaving(true);
    setSettingsError("");
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const message = result && typeof result === "object" && "error" in result && typeof result.error === "string"
          ? result.error
          : "تعذّر حفظ الإعدادات في قاعدة البيانات.";
        throw new Error(message);
      }

      const values = result && typeof result === "object" ? result as Partial<SavedSettings> : {};
      setSettings((current) => ({
        storeName: typeof values.storeName === "string" ? values.storeName : current.storeName,
        defaultHashtags: typeof values.defaultHashtags === "string" ? values.defaultHashtags : current.defaultHashtags,
        facebookPageId: typeof values.facebookPageId === "string" ? values.facebookPageId : current.facebookPageId,
        instagramAccountId: typeof values.instagramAccountId === "string" ? values.instagramAccountId : current.instagramAccountId,
        tiktokAccountId: typeof values.tiktokAccountId === "string" ? values.tiktokAccountId : current.tiktokAccountId,
      }));
      setToast(facebookAccessToken
        ? "حُفظت الإعدادات في قاعدة البيانات. لم يُرسل رمز الوصول حفاظاً على أمانه."
        : "تم حفظ التغييرات في قاعدة البيانات بنجاح.");
      setToastIsError(false);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(""), 4500);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "تعذّر حفظ الإعدادات في قاعدة البيانات.");
      setToastIsError(true);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(""), 4500);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f7f4] text-[#283630]">
      <div className="mx-auto min-h-screen max-w-[1440px] lg:flex">
        <aside className="hidden w-[270px] shrink-0 flex-col border-l border-[#ece8e1] bg-white px-5 py-6 lg:flex">
          <Link href="/" className="flex items-center gap-3 px-2">
            <BrandMark />
            <span>
              <span className="block text-[17px] font-bold tracking-tight text-[#233b34]">بيت ورد</span>
              <span className="mt-0.5 block text-xs text-[#92918b]">لوحة التسويق</span>
            </span>
          </Link>

          <div className="mt-10 px-3 text-[10px] font-bold tracking-[0.14em] text-[#aaa69d]">إعدادات الحساب</div>
          <nav className="mt-3 space-y-1" aria-label="أقسام الإعدادات">
            {SETTINGS_SECTIONS.map(({ id, title, icon: Icon }, index) => (
              <a
                key={id}
                href={`#${id}`}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium transition ${index === 0 ? "bg-[#edf4ef] text-[#17594c]" : "text-[#777b75] hover:bg-[#f7f6f2] hover:text-[#24483e]"}`}
              >
                <Icon size={18} strokeWidth={1.8} />
                <span>{title}</span>
              </a>
            ))}
          </nav>

          <div className="mt-auto rounded-2xl bg-[#f7f4ed] p-4">
            <div className="flex items-center gap-2 text-[#906b38]"><ShieldCheck size={16} /><span className="text-xs font-bold">بياناتك بأمان</span></div>
            <p className="mt-2 text-xs leading-6 text-[#858075]">لا نحفظ مفاتيح الوصول الحساسة في تخزين المتصفح.</p>
          </div>
          <div className="mt-5 border-t border-[#f0ede7] pt-5">
            <Link href="/" className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-[#6d766e] hover:bg-[#f7f6f2]"><ArrowRight size={15} /> العودة إلى لوحة التحكم</Link>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-[#ece9e2]/90 bg-[#f7f7f4]/90 px-4 py-3 backdrop-blur-xl sm:px-7 lg:px-10">
            <div className="mx-auto flex max-w-[1060px] items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Link href="/" className="grid size-10 place-items-center rounded-xl border border-[#eae7e0] bg-white text-[#56625a] transition hover:bg-[#f8f7f3] lg:hidden" aria-label="العودة إلى لوحة التحكم"><ArrowRight size={18} /></Link>
                <div>
                  <p className="hidden text-[11px] text-[#999b94] sm:block">لوحة التحكم <span className="px-1">/</span> الإعدادات</p>
                  <h1 className="text-sm font-bold text-[#2a3b32] sm:mt-1 sm:text-base">إعدادات المتجر</h1>
                </div>
              </div>
              <Link href="/" className="inline-flex items-center gap-2 rounded-xl border border-[#e9e7e0] bg-white px-3 py-2.5 text-xs font-semibold text-[#53645a] transition hover:border-[#cbd8cd]">
                <LayoutDashboard size={15} /><span className="hidden sm:inline">لوحة التحكم</span><ChevronLeft size={14} />
              </Link>
            </div>
          </header>

          <div className="mx-auto max-w-[1060px] px-4 pb-28 pt-6 sm:px-7 sm:pt-8 lg:px-10 lg:pb-12">
            <div className="mb-6 sm:mb-8">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eaf2e9] px-3 py-1.5 text-[10px] font-bold text-[#4d795f]"><Settings2 size={13} /> تخصيص المتجر</span>
              <h2 className="mt-3 text-[24px] font-bold tracking-tight text-[#273a31] sm:text-[30px]">كل شيء على ذوقك</h2>
              <p className="mt-2 max-w-2xl text-xs leading-6 text-[#8e928a] sm:text-sm">حدّثي معلومات المتجر، جهّزي قنواتك، واختاري التجربة التي تناسب بيت ورد.</p>
            </div>

            <div className="mb-5 flex gap-2 overflow-x-auto pb-1 lg:hidden">
              {SETTINGS_SECTIONS.map(({ id, title, icon: Icon }) => (
                <a key={id} href={`#${id}`} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-[#e9e7e0] bg-white px-3 py-2.5 text-[11px] font-semibold text-[#627066]"><Icon size={14} />{title}</a>
              ))}
            </div>

            <form onSubmit={saveSettings}>
              <fieldset disabled={!settingsLoaded} className="min-w-0 space-y-5 disabled:opacity-70">
              <section id="store" className="scroll-mt-24 overflow-hidden rounded-[22px] border border-[#ece9e2] bg-white shadow-[0_4px_24px_rgba(42,53,44,0.035)]">
                <SectionHeading icon={Store} title="إعدادات المتجر العامة" description="المعلومات التي تظهر في لوحة التسويق ومحتواك." />
                <div className="grid gap-5 px-5 py-5 sm:grid-cols-2 sm:px-7 sm:py-6">
                  <Field label="اسم المتجر" htmlFor="store-name" hint="الاسم الذي يظهر في لوحة التحكم">
                    <input id="store-name" value={settings.storeName} onChange={(event) => updateSetting("storeName", event.target.value)} maxLength={80} className={inputClass} placeholder="اسم المتجر" />
                  </Field>
                  <Field label="الوسوم الافتراضية" htmlFor="hashtags" hint="تُضاف تلقائياً عند إعداد نص المنشور">
                    <div className="relative">
                      <Hash size={16} className="pointer-events-none absolute right-3.5 top-3.5 text-[#9b9c95]" />
                      <input id="hashtags" value={settings.defaultHashtags} onChange={(event) => updateSetting("defaultHashtags", event.target.value)} className={`${inputClass} pr-10`} dir="rtl" placeholder="#بيت_ورد #تنسيق_زهور" />
                    </div>
                  </Field>
                  <div className="sm:col-span-2 flex flex-wrap items-center gap-2 rounded-xl bg-[#f8f8f4] px-3.5 py-3">
                    <WandSparkles size={15} className="text-[#a27d52]" />
                    <span className="text-[11px] text-[#858a82]">معاينة الوسوم:</span>
                    {(settings.defaultHashtags.trim() || "#بيت_ورد #تنسيق_زهور").split(/\s+/).filter(Boolean).map((tag) => <span key={tag} className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-[#577064]">{tag.startsWith("#") ? tag : `#${tag}`}</span>)}
                  </div>
                </div>
              </section>

              <section id="platforms" className="scroll-mt-24 overflow-hidden rounded-[22px] border border-[#ece9e2] bg-white shadow-[0_4px_24px_rgba(42,53,44,0.035)]">
                <SectionHeading icon={KeyRound} title="ربط منصات التواصل" description="جهّزي بيانات الربط للنشر المباشر عند تفعيل واجهات المنصات." trailing={<span className="rounded-full bg-[#f5f2e9] px-2.5 py-1 text-[10px] font-semibold text-[#8c754a]">إعداد مستقبلي</span>} />
                <div className="space-y-5 px-5 py-5 sm:px-7 sm:py-6">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Facebook Page ID" htmlFor="facebook-page-id" hint="معرّف صفحة المتجر">
                      <div className="relative">
                        <span className="pointer-events-none absolute right-3.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md bg-[#edf3ff] text-sm font-bold text-[#1877f2]">f</span>
                        <input id="facebook-page-id" value={settings.facebookPageId} onChange={(event) => updateSetting("facebookPageId", event.target.value)} className={`${inputClass} pr-12`} placeholder="مثال: 1029384756" autoComplete="off" />
                      </div>
                    </Field>
                    <Field label="Instagram Account ID" htmlFor="instagram-account-id" hint="معرّف حساب Instagram Business">
                      <div className="relative">
                        <Camera size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#bd647b]" />
                        <input id="instagram-account-id" value={settings.instagramAccountId} onChange={(event) => updateSetting("instagramAccountId", event.target.value)} className={`${inputClass} pr-10`} placeholder="معرّف الحساب التجاري" autoComplete="off" />
                      </div>
                    </Field>
                    <Field label="TikTok Account ID" htmlFor="tiktok-account-id" hint="معرّف حساب TikTok">
                      <div className="relative">
                        <Camera size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#354d59]" />
                        <input id="tiktok-account-id" value={settings.tiktokAccountId} onChange={(event) => updateSetting("tiktokAccountId", event.target.value)} className={`${inputClass} pr-10`} placeholder="معرّف الحساب" autoComplete="off" />
                      </div>
                    </Field>
                  </div>

                  <Field label="Facebook Access Token" htmlFor="facebook-access-token" hint="يُخفى أثناء الإدخال ولا يُحفظ في المتصفح">
                    <div className="relative">
                      <LockKeyhole size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#92978e]" />
                      <input id="facebook-access-token" type={showAccessToken ? "text" : "password"} value={facebookAccessToken} onChange={(event) => setFacebookAccessToken(event.target.value)} className={`${inputClass} px-11`} placeholder="أدخلي رمز الوصول عند تفعيل التكامل" autoComplete="new-password" />
                      <button type="button" onClick={() => setShowAccessToken((visible) => !visible)} className="absolute left-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#8f948c] hover:bg-[#f4f3ef]" aria-label={showAccessToken ? "إخفاء رمز الوصول" : "إظهار رمز الوصول"}>{showAccessToken ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                    </div>
                  </Field>

                  <div className="flex items-start gap-2.5 rounded-xl border border-[#eee9dc] bg-[#fbf9f3] px-3.5 py-3 text-[11px] leading-6 text-[#817a68]">
                    <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[#8e876d]" />
                    <p>حقول الربط جاهزة للتكامل المستقبلي. لأمانك، لا يُحفظ رمز الوصول في التخزين المحلي؛ خزّنيه لاحقاً في إعدادات الخادم السرية قبل تفعيل النشر.</p>
                  </div>
                </div>
              </section>

              <section id="cloudinary" className="scroll-mt-24 overflow-hidden rounded-[22px] border border-[#ece9e2] bg-white shadow-[0_4px_24px_rgba(42,53,44,0.035)]">
                <SectionHeading icon={Cloud} title="التخزين السحابي" description="مساحة حفظ الصور والفيديوهات المرفوعة للمنشورات." />
                <div className="px-5 py-5 sm:px-7 sm:py-6">
                  <div className="flex flex-col gap-4 rounded-2xl border border-[#eeece5] bg-[#fcfcf9] p-4 sm:flex-row sm:items-center sm:p-5">
                    <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-[#f0f4ec] text-[#5a8068]"><Cloud size={22} strokeWidth={1.7} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-[#858a82]">مجلد الرفع المخصص</p>
                      <p dir="ltr" className="mt-1.5 w-fit rounded-lg border border-[#eeece5] bg-white px-3 py-1.5 font-mono text-xs font-semibold text-[#44564a]">bayt-ward-dashboard</p>
                    </div>
                    <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold ${cloudinaryConfigured ? "bg-[#edf6ef] text-[#548260]" : "bg-[#fff4e9] text-[#a07035]"}`}>
                      <span className={`size-1.5 rounded-full ${cloudinaryConfigured ? "bg-[#67a574]" : "bg-[#d29b50]"}`} />
                      {cloudinaryConfigured ? "بيانات الاتصال مُهيأة" : "تحققي من إعدادات الخادم"}
                    </span>
                  </div>
                  <p className="mt-3 flex items-center gap-1.5 text-[10px] text-[#989b93]"><CircleHelp size={13} /> بيانات Cloudinary السرية محفوظة في متغيرات بيئة الخادم.</p>
                </div>
              </section>

              <section id="appearance" className="scroll-mt-24 overflow-hidden rounded-[22px] border border-[#ece9e2] bg-white shadow-[0_4px_24px_rgba(42,53,44,0.035)]">
                <SectionHeading icon={Palette} title="تفضيلات المظهر" description="اختيارات تجعل لوحة التحكم أقرب لهوية بيت ورد." />
                <div className="space-y-3 px-5 py-5 sm:px-7 sm:py-6">
                  <div className="flex flex-col gap-4 rounded-2xl border border-[#eeece5] p-4 sm:flex-row sm:items-center">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#f7f0ea] text-[#a57555]"><span className="text-lg font-bold">Aa</span></span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-[#465148]">خط Cairo</p>
                      <p className="mt-1 text-[11px] leading-5 text-[#93968e]">الخط العربي الأساسي المستخدم في كامل لوحة التحكم.</p>
                    </div>
                    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#edf6ef] px-3 py-1.5 text-[11px] font-semibold text-[#548260]"><Check size={13} strokeWidth={2.5} /> مُفعّل</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#eeece5] p-4">
                    <div>
                      <p className="text-sm font-semibold text-[#465148]">اتجاه الواجهة</p>
                      <p className="mt-1 text-[11px] text-[#93968e]">العربية · من اليمين إلى اليسار</p>
                    </div>
                    <span className="rounded-full bg-[#f4f3ef] px-3 py-1.5 text-[11px] font-semibold text-[#737a72]">RTL</span>
                  </div>
                </div>
              </section>

              <div className="sticky bottom-3 z-10 flex flex-col-reverse gap-3 rounded-2xl border border-[#ece9e2] bg-white/95 p-3 shadow-[0_8px_30px_rgba(42,53,44,0.08)] backdrop-blur-xl sm:static sm:flex-row sm:items-center sm:justify-between sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
                <p className="hidden text-[11px] text-[#969990] sm:block">تُحفظ إعدادات المتجر ومعرّفات الحساب في قاعدة بيانات المتجر.</p>
                <button type="submit" disabled={!settingsLoaded || isSaving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#205c4e] px-5 py-3 text-sm font-bold text-white shadow-[0_5px_12px_rgba(32,92,78,0.16)] transition hover:bg-[#184d41] disabled:cursor-wait disabled:opacity-60">
                  {isSaving || !settingsLoaded ? <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Save size={16} />}
                  {!settingsLoaded ? "جار تحميل الإعدادات..." : isSaving ? "جارٍ حفظ التغييرات..." : "حفظ التغييرات"}
                </button>
              </div>
              </fieldset>
            </form>
          </div>
        </div>
      </div>

      {settingsError ? <p role="alert" className="fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-xl rounded-xl border border-[#f0d4cc] bg-[#fff5f2] px-4 py-3 text-xs leading-6 text-[#a44f46] shadow-lg">{settingsError}</p> : null}
      {toast ? (
        <div role={toastIsError ? "alert" : "status"} aria-live="polite" className={`fixed bottom-24 left-4 right-4 z-50 mx-auto flex max-w-md items-start gap-3 rounded-2xl border bg-white px-4 py-3.5 text-sm shadow-[0_12px_36px_rgba(35,66,47,0.16)] sm:bottom-6 sm:left-auto sm:right-6 ${toastIsError ? "border-[#f0d4cc] text-[#a44f46]" : "border-[#d9e8d9] text-[#426a4c]"}`}>
          <span className={`grid size-7 shrink-0 place-items-center rounded-full ${toastIsError ? "bg-[#fff1ef]" : "bg-[#edf6ef]"}`}>{toastIsError ? <X size={16} /> : <CheckCircle2 size={16} />}</span>
          <span className="flex-1 text-xs leading-6">{toast}</span>
          <button type="button" onClick={() => setToast("")} className="rounded-md p-1 text-[#8f998f] hover:bg-[#f4f6f1]" aria-label="إغلاق الإشعار"><X size={15} /></button>
        </div>
      ) : null}
    </main>
  );
}

const inputClass = "min-h-11 w-full rounded-xl border border-[#e9e8e1] bg-[#fdfdfb] px-3.5 py-2.5 text-sm text-[#3e4941] outline-none transition placeholder:text-[#b1b1a9] focus:border-[#a3bba7] focus:bg-white focus:ring-4 focus:ring-[#eaf1eb]";

function BrandMark() {
  return <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#174f45] text-[#fffaf4] shadow-sm"><span className="font-serif text-2xl leading-none">و</span></span>;
}

function SectionHeading({
  icon: Icon,
  title,
  description,
  trailing,
}: {
  icon: typeof Store;
  title: string;
  description: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-[#f0ede7] px-5 py-5 sm:px-7">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf4ef] text-[#256052]"><Icon size={19} strokeWidth={1.8} /></span>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-bold text-[#2d3a32]">{title}</h2>
        <p className="mt-1 text-[10px] leading-5 text-[#989991] sm:text-[11px]">{description}</p>
      </div>
      {trailing}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <label htmlFor={htmlFor} className="text-xs font-semibold text-[#48534b]">{label}</label>
        <span className="text-[10px] text-[#a0a199]">{hint}</span>
      </div>
      {children}
    </div>
  );
}
