"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ArrowDownLeft,
  ArrowUpLeft,
  Bell,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  CircleCheck,
  Clock3,
  FileImage,
  FolderOpen,
  Heart,
  ImagePlus,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  MoreHorizontal,
  Music2,
  Plus,
  Search,
  Send,
  Settings2,
  Sparkles,
  Sun,
  Trash2,
  UploadCloud,
  Video,
  X,
  Moon,
} from "lucide-react";
import { createPost, type SavedPost } from "@/app/actions/create-post";
import { cleanupFailedUpload } from "@/app/actions/cleanup-upload";
import { deletePost } from "@/app/actions/delete-post";
import { uploadMedia } from "@/app/actions/upload-media";
import BrandMark from "@/components/brand-mark";

type DashboardStats = {
  total: number;
  pending: number;
  published: number;
};

type DashboardClientProps = {
  initialPosts: SavedPost[];
  initialStats: DashboardStats;
  databaseAvailable: boolean;
};

const PLATFORMS = [
  { id: "instagram", name: "Instagram", subtitle: "منشور أو Reel", icon: Camera, style: "instagram" },
  { id: "tiktok", name: "TikTok", subtitle: "فيديو قصير", icon: Music2, style: "tiktok" },
  { id: "facebook", name: "Facebook", subtitle: "منشور الصفحة", icon: null, style: "facebook" },
] as const;

const STATUS_LABELS: Record<SavedPost["status"], string> = {
  PENDING: "قيد الانتظار",
  PUBLISHED: "تم النشر",
  FAILED: "تعذّر النشر",
};

function subscribeToTheme(onChange: () => void) {
  window.addEventListener("bayt-ward-theme-change", onChange);
  return () => window.removeEventListener("bayt-ward-theme-change", onChange);
}

function getThemeSnapshot() {
  return document.documentElement.classList.contains("dark");
}

function getServerThemeSnapshot() {
  return false;
}

function PlatformMark({ platform }: { platform: (typeof PLATFORMS)[number] }) {
  const Icon = platform.icon;

  if (platform.style === "facebook") {
    return (
      <span className="grid size-10 place-items-center rounded-xl bg-[#edf3ff] text-lg font-bold text-[#1877f2]">
        f
      </span>
    );
  }

  return (
    <span
      className={`grid size-10 place-items-center rounded-xl ${platform.style === "instagram" ? "bg-[#fff0f2] text-[#c14f77]" : "bg-[#f1eff4] text-[#17151b]"}`}
    >
      {Icon ? <Icon size={19} strokeWidth={1.8} /> : null}
    </span>
  );
}

function Sidebar({ storeName }: { storeName: string }) {
  const navItems = [
    { label: "نظرة عامة", icon: LayoutDashboard, href: "/", active: true },
    { label: "المنشورات", icon: CalendarDays, href: "/posts", active: false },
    { label: "مكتبة الوسائط", icon: FolderOpen, href: "/media", active: false },
  ];

  return (
    <aside className="hidden min-h-screen w-[258px] shrink-0 flex-col border-l border-[#ece8e1] bg-white px-5 py-6 lg:flex">
      <div className="flex items-center gap-3 px-2">
          <BrandMark />
        <div>
          <p className="text-[17px] font-bold tracking-tight text-[#233b34]">{storeName}</p>
          <p className="mt-0.5 text-xs text-[#92918b]">لوحة التسويق</p>
        </div>
      </div>

      <div className="mt-10 px-3 text-[10px] font-bold tracking-[0.16em] text-[#a8a49b]">القائمة الرئيسية</div>
      <nav className="mt-3 space-y-1" aria-label="القائمة الرئيسية">
        {navItems.map(({ label, icon: Icon, href, active }) => (
          <a
            key={label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium transition ${active ? "bg-[#edf4ef] text-[#17594c]" : "text-[#777b75] hover:bg-[#f7f6f2] hover:text-[#24483e]"}`}
          >
            <Icon size={18} strokeWidth={1.8} />
            <span>{label}</span>
            {label === "المنشورات" ? (
              <span className="mr-auto rounded-full bg-white px-2 py-0.5 text-[10px] text-[#777b75]">جديد</span>
            ) : null}
          </a>
        ))}
      </nav>

      <div className="mt-9 px-3 text-[10px] font-bold tracking-[0.16em] text-[#a8a49b]">إعدادات المتجر</div>
      <nav className="mt-3 space-y-1" aria-label="إعدادات المتجر">
        <a href="/channels" className="flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium text-[#777b75] transition hover:bg-[#f7f6f2] hover:text-[#24483e]">
          <Send size={18} strokeWidth={1.8} />
          <span>قنوات النشر</span>
        </a>
        <a href="/settings" className="flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium text-[#777b75] transition hover:bg-[#f7f6f2] hover:text-[#24483e]">
          <Settings2 size={18} strokeWidth={1.8} />
          <span>الإعدادات</span>
        </a>
      </nav>

      <div className="mt-auto rounded-2xl bg-[#f7f4ed] p-4">
        <div className="flex items-center gap-2 text-[#906b38]">
          <Sparkles size={16} />
          <span className="text-xs font-bold">مساحة إبداعية</span>
        </div>
        <p className="mt-2 text-xs leading-6 text-[#858075]">كل لحظة جميلة تستحق أن تُشارك.</p>
        <div className="mt-3 flex items-center gap-1" aria-label="تقييم ممتاز">
          {[0, 1, 2, 3, 4].map((star) => <Heart key={star} size={12} fill="currentColor" className="text-[#c78175]" />)}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3 border-t border-[#f0ede7] px-1 pt-5">
        <div className="grid size-10 place-items-center rounded-full bg-[#f1e4da] text-sm font-bold text-[#785b48]">ب</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[#343c36]">فريق {storeName}</p>
          <p className="mt-0.5 text-[11px] text-[#96958f]">مدير المتجر</p>
        </div>
        <MoreHorizontal size={18} className="text-[#93948e]" />
      </div>
    </aside>
  );
}

function StatusPill({ status }: { status: SavedPost["status"] }) {
  const styles = {
    PENDING: "bg-[#fff5e5] text-[#9c6d24]",
    PUBLISHED: "bg-[#e9f5ed] text-[#36734c]",
    FAILED: "bg-[#fff0ee] text-[#b4534c]",
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${styles[status]}`}>
      {status === "PENDING" ? <Clock3 size={12} /> : status === "PUBLISHED" ? <CircleCheck size={12} /> : <X size={12} />}
      {STATUS_LABELS[status]}
    </span>
  );
}

function HistorySection({ posts, databaseAvailable, searchTerm, onDelete, deletingPostId, actionError, actionNotice }: {
  posts: SavedPost[];
  databaseAvailable: boolean;
  searchTerm: string;
  onDelete: (post: SavedPost) => void;
  deletingPostId: string | null;
  actionError: string;
  actionNotice: string;
}) {
  return (
    <section id="history" className="mt-7 overflow-hidden rounded-[22px] border border-[#ece9e2] bg-white shadow-[0_4px_24px_rgba(42,53,44,0.035)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f1eee8] px-5 py-5 sm:px-7">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-bold text-[#2c3730]">سجل المنشورات السابقة</h2>
            <span className="rounded-full bg-[#f4f3ef] px-2.5 py-1 text-[11px] font-semibold text-[#85867e]">{posts.length}</span>
          </div>
          <p className="mt-1.5 text-xs text-[#95958e]">تابعي حالة محتواك من مكان واحد</p>
        </div>
        <a href="/posts" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#286355] hover:text-[#174f45]">
          عرض الكل <ArrowUpLeft size={14} />
        </a>
      </div>

      {actionError ? <div role="alert" className="mx-5 mt-4 rounded-xl border border-[#f0d4cc] bg-[#fff5f2] px-4 py-3 text-xs leading-6 text-[#a44f46] sm:mx-7">{actionError}</div> : null}
      {actionNotice ? <div role="status" className="mx-5 mt-4 rounded-xl border border-[#d6e8d8] bg-[#f1f8f1] px-4 py-3 text-xs leading-6 text-[#34704f] sm:mx-7">{actionNotice}</div> : null}

      {!databaseAvailable ? (
        <div className="m-5 rounded-xl border border-[#f3d9b5] bg-[#fff8ed] p-4 text-sm text-[#946b32]">
          تعذّر الاتصال بقاعدة البيانات. تحققي من إعداد الاتصال ثم أعيدي تحميل الصفحة.
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-[#f4f6f1] text-[#638170]"><FolderOpen size={24} /></span>
          <p className="mt-4 text-sm font-semibold text-[#4b544c]">{searchTerm ? "ما لقينا منشورات مطابقة" : "لا توجد منشورات بعد"}</p>
          <p className="mt-1.5 max-w-xs text-xs leading-6 text-[#92948d]">{searchTerm ? "جرّبي كلمات بحث مختلفة." : "أضيفي أول منشورك وسيظهر هنا مع حالته والمنصات المختارة."}</p>
        </div>
      ) : (
        <div className="divide-y divide-[#f3f1ec]">
          {posts.map((post) => {
            const isVideo = post.mediaUrl.includes("/video/upload/");
            const date = new Intl.DateTimeFormat("ar", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(post.createdAt));

            return (
              <article key={post.id} className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-3 px-5 py-4 sm:grid-cols-[64px_minmax(0,1fr)_auto] sm:gap-4 sm:px-7">
                <div className="relative size-14 overflow-hidden rounded-xl bg-[#f3f0e9] sm:size-16">
                  <Image src={post.mediaUrl} alt="وسائط المنشور" fill sizes="64px" className="object-cover" unoptimized />
                  {isVideo ? <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[9px] text-white">فيديو</span> : null}
                </div>
                <div className="min-w-0">
                  <p className="line-clamp-1 text-sm font-semibold text-[#39423b]">{post.caption}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#999a93]">
                    <span>{date}</span><span aria-hidden="true">·</span>
                    {post.platforms.map((platform) => <span key={platform} className="capitalize">{platform}</span>)}
                  </div>
                </div>
                <div className="col-span-2 flex items-center justify-between gap-3 pr-[68px] sm:col-span-1 sm:justify-end sm:pr-0">
                  <StatusPill status={post.status} />
                  <button
                    type="button"
                    aria-label={`حذف المنشور: ${post.caption.slice(0, 40)}`}
                    title="حذف المنشور"
                    disabled={deletingPostId === post.id}
                    onClick={() => onDelete(post)}
                    className="rounded-lg p-1.5 text-[#92948d] transition hover:bg-[#fff1ef] hover:text-[#b4534c] disabled:cursor-wait disabled:opacity-50"
                  >
                    {deletingPostId === post.id ? <LoaderCircle size={17} className="animate-spin" /> : <Trash2 size={17} />}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function DashboardClient({ initialPosts, initialStats, databaseAvailable }: DashboardClientProps) {
  const [posts, setPosts] = useState(initialPosts);
  const [storeName, setStoreName] = useState("بيت ورد");
  const [stats, setStats] = useState(initialStats);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["instagram"]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [historyNotice, setHistoryNotice] = useState("");
  const isDarkMode = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  const filteredPosts = posts.filter((post) =>
    `${post.caption} ${post.platforms.join(" ")}`.toLocaleLowerCase("ar").includes(searchTerm.trim().toLocaleLowerCase("ar")),
  );

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  function toggleTheme() {
    const nextDarkMode = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", nextDarkMode);
    window.dispatchEvent(new Event("bayt-ward-theme-change"));
    try {
      window.localStorage.setItem("bayt-ward-theme", nextDarkMode ? "dark" : "light");
    } catch {
      // The in-memory theme still works when browser storage is unavailable.
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/settings", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const value: unknown = await response.json();
        const savedStoreName = value && typeof value === "object" && "storeName" in value
          ? value.storeName
          : null;
        if (typeof savedStoreName === "string" && savedStoreName.trim()) {
          setStoreName(savedStoreName.trim());
        }
      })
      .catch(() => {
        // Keep the default brand name when the settings API is unavailable.
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileMenuOpen]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  async function handleDeletePost(post: SavedPost) {
    if (!window.confirm("هل أنتِ متأكدة من حذف هذا المنشور ووسائطه؟ لا يمكن التراجع عن الحذف.")) return;

    setDeletingPostId(post.id);
    setError("");
    setNotice("");
    setHistoryError("");
    setHistoryNotice("");
    try {
      const result = await deletePost(post.id);
      if (!result.success) {
        setHistoryError(result.error);
        return;
      }

      setPosts((current) => current.filter((item) => item.id !== post.id));
      setStats((current) => ({
        ...current,
        total: Math.max(0, current.total - 1),
        pending: post.status === "PENDING" ? Math.max(0, current.pending - 1) : current.pending,
        published: post.status === "PUBLISHED" ? Math.max(0, current.published - 1) : current.published,
      }));
      setHistoryNotice(result.cloudinaryCleanupPending
        ? "حُذف المنشور، لكن تعذّر تنظيف إحدى الوسائط من Cloudinary."
        : "تم حذف المنشور ووسائطه بنجاح.");
    } catch {
      setHistoryError("تعذّر حذف المنشور. تحققي من الاتصال ثم حاولي مرة أخرى.");
    } finally {
      setDeletingPostId(null);
    }
  }

  function clearSelectedFile() {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    setPreviewUrl("");
    setSelectedFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function selectFile(file?: File) {
    if (!file) return;
    setError("");
    setNotice("");
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      setError("الملف غير مدعوم. اختاري صورة أو فيديو.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("الحد الأقصى لحجم الملف هو 10 ميجابايت.");
      return;
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = URL.createObjectURL(file);
    setPreviewUrl(objectUrlRef.current);
    setSelectedFile(file);
  }

  function togglePlatform(platform: string) {
    setSelectedPlatforms((current) =>
      current.includes(platform) ? current.filter((item) => item !== platform) : [...current, platform],
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!selectedFile) {
      setError("أضيفي صورة أو فيديو للمنشور أولاً.");
      return;
    }
    if (!caption.trim()) {
      setError("أضيفي نصاً يرافق منشورك.");
      return;
    }
    if (selectedPlatforms.length === 0) {
      setError("اختاري منصة واحدة على الأقل.");
      return;
    }

    setIsSaving(true);
    try {
      const settingsResponse = await fetch("/api/settings", { cache: "no-store" });
      const savedSettings: unknown = await settingsResponse.json();
      if (!settingsResponse.ok) {
        const message = savedSettings && typeof savedSettings === "object" && "error" in savedSettings && typeof savedSettings.error === "string"
          ? savedSettings.error
          : "تعذّر تحميل الوسوم الافتراضية من إعدادات المتجر.";
        setError(message);
        return;
      }

      const defaultHashtags = savedSettings && typeof savedSettings === "object" && "defaultHashtags" in savedSettings && typeof savedSettings.defaultHashtags === "string"
        ? savedSettings.defaultHashtags.trim().split(/\s+/).filter(Boolean)
        : [];
      let finalCaption = caption.trim();
      const missingHashtags = defaultHashtags
        .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
        .filter((tag) => !finalCaption.includes(tag));
      if (missingHashtags.length > 0) finalCaption = `${finalCaption}\n\n${missingHashtags.join(" ")}`;

      if (finalCaption.length > 2200) {
        setError("نص المنشور مع الوسوم الافتراضية يتجاوز الحد الأقصى 2200 حرف. اختصري النص أو الوسوم.");
        return;
      }

      const formData = new FormData();
      formData.set("file", selectedFile);
      const upload = await uploadMedia(formData);
      if (!upload.success) {
        setError(upload.error);
        return;
      }

      const result = await createPost({
        caption: finalCaption,
        mediaUrl: upload.mediaUrl,
        cloudinaryPublicId: upload.publicId,
        platforms: selectedPlatforms,
      });

      if (!result.success) {
        const cleanedUp = await cleanupFailedUpload(upload.publicId, upload.mediaUrl);
        setError(cleanedUp
          ? result.error
          : `${result.error} تعذّر تنظيف الملف المرفوع من التخزين السحابي.`);
        return;
      }

      setPosts((current) => [result.post, ...current].slice(0, 8));
      setStats((current) => ({ ...current, total: current.total + 1, pending: current.pending + 1 }));
      clearSelectedFile();
      setCaption("");
      setNotice("تمت إضافة منشورك إلى قائمة النشر بنجاح.");
    } catch {
      setError("حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div id="top" className="min-h-screen bg-[#f7f7f4] text-[#283630]">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <Sidebar storeName={storeName} />

        <main className="min-w-0 flex-1 pb-24 lg:pb-8">
          <header className="sticky top-0 z-20 border-b border-[#ece9e2]/90 bg-[#f7f7f4]/90 px-4 py-3 backdrop-blur-xl sm:px-7 lg:px-9">
            <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setMobileMenuOpen((open) => !open)} className="rounded-xl border border-[#eae7e0] bg-white p-2.5 text-[#56625a] lg:hidden" aria-label={mobileMenuOpen ? "إغلاق القائمة" : "فتح القائمة"} aria-expanded={mobileMenuOpen}>
                  {mobileMenuOpen ? <X size={19} /> : <Menu size={19} />}
                </button>
                <div className="lg:hidden"><BrandMark size="size-10" /></div>
                <div className="hidden sm:block">
                  <p className="text-xs text-[#92958d]">{new Intl.DateTimeFormat("ar", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date())}</p>
                  <h1 className="mt-0.5 flex items-center gap-1.5 text-lg font-bold text-[#26382f]">مساء الورد، فريق {storeName}<span className="hidden lg:inline-flex"><BrandMark size="size-10" /></span></h1>
                </div>
                <h1 className="text-sm font-bold text-[#26382f] sm:hidden">لوحة التسويق</h1>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="grid size-10 place-items-center rounded-xl border border-[#ece9e2] bg-white text-[#68726a] transition hover:bg-[#faf9f6]"
                  aria-label={isDarkMode ? "التبديل إلى الوضع الفاتح" : "التبديل إلى الوضع الداكن"}
                  title={isDarkMode ? "الوضع الفاتح" : "الوضع الداكن"}
                >
                  {isDarkMode ? <Sun size={17} /> : <Moon size={17} />}
                </button>
                <label className="hidden h-10 w-52 items-center gap-2 rounded-xl border border-[#ece9e2] bg-white px-3 text-[#969890] md:flex">
                  <Search size={16} />
                  <input ref={searchInputRef} value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") document.getElementById("history")?.scrollIntoView({ behavior: "smooth" }); }} className="min-w-0 flex-1 bg-transparent text-xs text-[#48534b] outline-none placeholder:text-[#a5a69f]" placeholder="ابحثي في المنشورات" aria-label="البحث في المنشورات" />
                  <kbd className="rounded border border-[#eeece7] px-1.5 py-0.5 text-[10px]">⌘ K</kbd>
                </label>
                <div className="relative">
                <button type="button" onClick={() => { setNotificationsOpen((open) => !open); setAccountMenuOpen(false); }} className="relative grid size-10 place-items-center rounded-xl border border-[#ece9e2] bg-white text-[#68726a] hover:bg-[#faf9f6]" aria-label="الإشعارات" aria-expanded={notificationsOpen}>
                  <Bell size={17} />
                  {stats.pending > 0 ? <span className="absolute -left-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-[#c47869] px-1 text-[9px] font-bold text-white">{stats.pending > 9 ? "9+" : stats.pending}</span> : null}
                </button>
                {notificationsOpen ? <div className="absolute left-0 top-12 z-40 w-64 rounded-2xl border border-[#ece9e2] bg-white p-4 text-right shadow-xl"><p className="text-xs font-bold text-[#39463d]">التنبيهات</p><p className="mt-2 text-xs leading-6 text-[#858a82]">{stats.pending ? `لديك ${stats.pending} منشور بانتظار النشر.` : "لا توجد تنبيهات جديدة."}</p><a href="#history" onClick={() => setNotificationsOpen(false)} className="mt-3 inline-flex text-[11px] font-semibold text-[#286355]">عرض سجل المنشورات</a></div> : null}
                </div>
                <div className="relative">
                <button type="button" onClick={() => { setAccountMenuOpen((open) => !open); setNotificationsOpen(false); }} className="grid size-10 place-items-center rounded-xl border border-[#ece9e2] bg-white text-[#68726a]" aria-label="قائمة الحساب" aria-expanded={accountMenuOpen}>
                  <ChevronDown size={14} className="text-[#989991]" />
                </button>
                {accountMenuOpen ? <div className="absolute left-0 top-12 z-40 w-52 rounded-2xl border border-[#ece9e2] bg-white p-2 text-right shadow-xl"><div className="border-b border-[#f0ede7] px-3 py-2"><p className="text-xs font-semibold text-[#39463d]">فريق {storeName}</p><p className="mt-1 text-[10px] text-[#96958f]">مدير المتجر</p></div><a href="/settings" onClick={() => setAccountMenuOpen(false)} className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium text-[#68726a] hover:bg-[#f7f6f2]"><Settings2 size={15} /> إعدادات المتجر</a></div> : null}
                </div>
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-[1280px] px-4 pt-6 sm:px-7 sm:pt-8 lg:px-9">
            <div className="mb-6 flex items-end justify-between gap-4 sm:mb-7">
              <div>
                <p className="text-xs font-semibold text-[#8b9188] sm:hidden">{new Intl.DateTimeFormat("ar", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date())}</p>
                <div className="mt-1 flex items-center gap-2 sm:mt-0">
                  <h2 className="text-[22px] font-bold tracking-tight text-[#273a31] sm:text-[26px]">مساحة المحتوى</h2>
                  <span className="rounded-full bg-[#eaf2e9] px-2.5 py-1 text-[10px] font-bold text-[#4d795f]">موسم جديد</span>
                </div>
                <p className="mt-1.5 text-xs text-[#92958d] sm:text-sm">حضّري منشوراتك وشاركي جمال بيت ورد مع الجميع.</p>
              </div>
              <a href="#history" className="hidden items-center gap-2 rounded-xl border border-[#e9e7e0] bg-white px-3.5 py-2.5 text-xs font-semibold text-[#53645a] transition hover:border-[#cbd8cd] sm:inline-flex">
                <Clock3 size={15} /> سجل المنشورات
              </a>
            </div>

            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4" aria-label="إحصائيات المنشورات">
              <StatCard label="إجمالي المنشورات" value={stats.total} hint="منشور في المكتبة" icon={LayoutDashboard} tint="sage" />
              <StatCard label="قيد النشر" value={stats.pending} hint="بانتظار النشر" icon={Clock3} tint="sand" />
              <StatCard label="تم نشرها" value={stats.published} hint="منشور على القنوات" icon={CircleCheck} tint="mint" />
              <StatCard label="منصات متاحة" value={3} hint="اختاري قنوات النشر" icon={Send} tint="rose" />
            </section>

            <div className="mt-6 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_310px]">
              <section className="overflow-hidden rounded-[22px] border border-[#ece9e2] bg-white shadow-[0_4px_24px_rgba(42,53,44,0.035)]">
                <div className="flex items-center justify-between gap-3 border-b border-[#f0ede7] px-5 py-5 sm:px-7">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-[#edf4ef] text-[#256052]"><Plus size={20} /></span>
                    <div>
                      <h2 className="text-base font-bold text-[#2d3a32]">إنشاء منشور جديد</h2>
                      <p className="mt-1 text-[11px] text-[#989991]">خطوة واحدة لمشاركة لحظاتك الجميلة</p>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6 px-5 py-5 sm:px-7 sm:py-6">
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <label htmlFor="media-file" className="text-sm font-bold text-[#3b463f]">الوسائط</label>
                      <span className="text-[11px] text-[#9b9d95]">صورة أو فيديو · حتى 10 MB</span>
                    </div>
                    <input
                      ref={inputRef}
                      id="media-file"
                      type="file"
                      accept="image/*,video/*"
                      className="sr-only"
                      onChange={(event) => selectFile(event.target.files?.[0])}
                    />
                    {selectedFile && previewUrl ? (
                      <div className="relative overflow-hidden rounded-2xl border border-[#e9e7e0] bg-[#f6f4ef]">
                        <div className="relative aspect-[16/8] max-h-[340px] w-full">
                          {selectedFile.type.startsWith("video/") ? (
                            <video src={previewUrl} className="size-full object-contain" controls />
                          ) : (
                            <Image src={previewUrl} alt="معاينة الوسائط المختارة" fill sizes="(max-width: 768px) 100vw, 720px" className="object-contain" unoptimized />
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-3 border-t border-[#eae7df] bg-white px-4 py-3">
                          <div className="flex min-w-0 items-center gap-2.5">
                            {selectedFile.type.startsWith("video/") ? <Video size={16} className="shrink-0 text-[#648271]" /> : <FileImage size={16} className="shrink-0 text-[#648271]" />}
                            <span className="truncate text-xs font-medium text-[#58625a]">{selectedFile.name}</span>
                            <span className="shrink-0 text-[10px] text-[#9a9b94]">{formatBytes(selectedFile.size)}</span>
                          </div>
                          <button type="button" onClick={clearSelectedFile} className="grid size-8 shrink-0 place-items-center rounded-lg text-[#989991] transition hover:bg-[#fff1ef] hover:text-[#b4534c]" aria-label="إزالة الملف">
                            <X size={16} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={(event) => { event.preventDefault(); setIsDragging(false); selectFile(event.dataTransfer.files?.[0]); }}
                        className={`group flex min-h-[190px] w-full flex-col items-center justify-center rounded-2xl border border-dashed px-5 py-7 text-center transition sm:min-h-[220px] ${isDragging ? "border-[#3f806d] bg-[#eff6f0]" : "border-[#dcded5] bg-[#fbfbf8] hover:border-[#9db6a3] hover:bg-[#f8faf6]"}`}
                      >
                        <span className={`grid size-12 place-items-center rounded-2xl transition ${isDragging ? "bg-[#dcebe0] text-[#2c6a58]" : "bg-white text-[#618170] shadow-sm group-hover:-translate-y-0.5"}`}>
                          {isDragging ? <UploadCloud size={22} /> : <ImagePlus size={22} strokeWidth={1.7} />}
                        </span>
                        <span className="mt-3 text-sm font-semibold text-[#47554b]">{isDragging ? "أفلتي الملف هنا" : "اسحبي الوسائط وأفلتيها هنا"}</span>
                        <span className="mt-1.5 text-xs text-[#999b93]">أو اختاري ملفاً من جهازك</span>
                        <span className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[#e8e8e1] bg-white px-3.5 py-2 text-xs font-semibold text-[#53655a] shadow-sm transition group-hover:border-[#d7e2d7]">
                          <FolderOpen size={14} /> استعراض الملفات
                        </span>
                        <span className="mt-3 text-[10px] text-[#adaea7]">JPG · PNG · WEBP · MP4 · MOV</span>
                      </button>
                    )}
                  </div>

                  <div>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <label htmlFor="caption" className="text-sm font-bold text-[#3b463f]">نص المنشور</label>
                      <button type="button" onClick={() => setCaption((current) => current || "تفاصيل صغيرة تصنع لحظات جميلة 🌷") } className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold text-[#9a7454] transition hover:bg-[#faf3ea]">
                        <Sparkles size={13} /> اقتراح نص
                      </button>
                    </div>
                    <div className="relative">
                      <textarea
                        id="caption"
                        value={caption}
                        onChange={(event) => setCaption(event.target.value.slice(0, 2200))}
                        rows={4}
                        maxLength={2200}
                        placeholder="اكتبي شيئاً جميلاً يرافق منشورك..."
                        className="w-full resize-y rounded-2xl border border-[#e9e8e1] bg-[#fdfdfb] px-4 py-3.5 text-sm leading-7 text-[#3e4941] outline-none transition placeholder:text-[#b1b1a9] focus:border-[#a3bba7] focus:bg-white focus:ring-4 focus:ring-[#eaf1eb]"
                      />
                      <span className="absolute bottom-3 left-3 rounded-md bg-white/90 px-2 py-1 text-[10px] text-[#a0a199]">{caption.length} / 2200</span>
                    </div>
                  </div>

                  <div id="platforms">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <span className="text-sm font-bold text-[#3b463f]">اختاري منصات النشر</span>
                      <span className="text-[11px] text-[#9b9d95]">يمكنك اختيار أكثر من منصة</span>
                    </div>
                    <div className="grid gap-2.5 sm:grid-cols-3">
                      {PLATFORMS.map((platform) => {
                        const selected = selectedPlatforms.includes(platform.id);
                        return (
                          <button
                            key={platform.id}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => togglePlatform(platform.id)}
                            className={`flex items-center gap-2.5 rounded-xl border p-3 text-right transition ${selected ? "border-[#a9c1ac] bg-[#f2f7f1] ring-1 ring-[#e5eee4]" : "border-[#eeece6] bg-white hover:border-[#d9ded5] hover:bg-[#fbfbf8]"}`}
                          >
                            <PlatformMark platform={platform} />
                            <span className="min-w-0 flex-1">
                              <span className="block text-xs font-bold text-[#455047]">{platform.name}</span>
                              <span className="mt-1 block truncate text-[10px] text-[#9a9c94]">{platform.subtitle}</span>
                            </span>
                            <span className={`grid size-[18px] shrink-0 place-items-center rounded-md border ${selected ? "border-[#3f806d] bg-[#3f806d] text-white" : "border-[#d9dcd4] bg-white text-transparent"}`}>
                              <Check size={12} strokeWidth={3} />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {error ? <div role="alert" className="rounded-xl border border-[#f0d4cc] bg-[#fff5f2] px-4 py-3 text-xs leading-6 text-[#a44f46]">{error}</div> : null}
                  {notice ? <div role="status" className="rounded-xl border border-[#d6e8d8] bg-[#f1f8f1] px-4 py-3 text-xs leading-6 text-[#34704f]">{notice}</div> : null}

                  <div className="flex flex-col-reverse gap-2.5 border-t border-[#f0ede7] pt-5 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[10px] leading-5 text-[#9a9c94]">سيُحفظ المنشور كـ «قيد الانتظار» حتى ربط قنوات النشر.</p>
                    <button
                      type="submit"
                      disabled={isSaving || !selectedFile || !caption.trim() || selectedPlatforms.length === 0}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#205c4e] px-5 py-3 text-sm font-bold text-white shadow-[0_5px_12px_rgba(32,92,78,0.16)] transition hover:bg-[#184d41] disabled:cursor-not-allowed disabled:bg-[#aabbb1] disabled:shadow-none"
                    >
                      {isSaving ? <LoaderCircle size={17} className="animate-spin" /> : <Send size={16} />}
                      {isSaving ? "جارٍ رفع المنشور..." : "نشر المنشور"}
                    </button>
                  </div>
                </form>
              </section>

              <aside className="space-y-4">
                <section className="relative overflow-hidden rounded-[22px] bg-[#215b4e] p-5 text-white shadow-[0_8px_26px_rgba(30,81,68,0.12)] sm:p-6">
                  <div className="absolute -left-8 -top-10 size-40 rounded-full border border-white/10" />
                  <div className="absolute -left-1 top-1 size-28 rounded-full border border-white/10" />
                  <div className="relative">
                    <span className="grid size-10 place-items-center rounded-xl bg-white/10 text-[#e8d5ad]"><Sparkles size={19} /></span>
                    <p className="mt-5 text-[10px] font-bold tracking-[0.14em] text-[#d3e4d8]">لمسة من بيت ورد</p>
                    <h3 className="mt-2 text-xl font-semibold leading-8">الجمال في التفاصيل الصغيرة</h3>
                    <p className="mt-2 text-xs leading-6 text-white/70">شاركي قصة كل تنسيق، واجعلي ألوان زهورك تتحدث عنك.</p>
                    <div className="mt-5 flex items-center justify-between border-t border-white/15 pt-4 text-[11px] text-white/80">
                      <span>فكرة محتوى اليوم</span><span className="inline-flex items-center gap-1">اكتشفي المزيد <ArrowDownLeft size={13} /></span>
                    </div>
                  </div>
                </section>

                <section className="rounded-[22px] border border-[#ece9e2] bg-white p-5 shadow-[0_4px_24px_rgba(42,53,44,0.035)] sm:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-[#364239]">منصات النشر</h3>
                      <p className="mt-1 text-[11px] text-[#999b94]">اختاري المنصات المناسبة لمحتواك</p>
                    </div>
                    <span className="grid size-8 place-items-center rounded-lg bg-[#f3f5ef] text-[#65806d]"><Send size={15} /></span>
                  </div>
                  <div className="mt-4 space-y-3">
                    {PLATFORMS.map((platform) => (
                      <div key={platform.id} className="flex items-center gap-3">
                        <PlatformMark platform={platform} />
                        <span className="flex-1 text-xs font-semibold text-[#59635b]">{platform.name}</span>
                        <span className="rounded-full bg-[#f4f3ef] px-2 py-1 text-[10px] font-semibold text-[#85867e]">متاحة</span>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={() => document.getElementById("platforms")?.scrollIntoView({ behavior: "smooth", block: "center" })} className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#dcded6] py-2.5 text-xs font-semibold text-[#718176] transition hover:border-[#a8bda9] hover:bg-[#f8faf6]">
                    <Plus size={14} /> اختيار المنصات
                  </button>
                </section>

                <section className="rounded-[22px] border border-[#ece9e2] bg-white p-5 shadow-[0_4px_24px_rgba(42,53,44,0.035)] sm:p-6">
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-9 place-items-center rounded-xl bg-[#fff4ec] text-[#b37b50]"><Camera size={17} /></span>
                    <h3 className="text-sm font-bold text-[#364239]">نصيحة سريعة</h3>
                  </div>
                  <p className="mt-3 text-xs leading-6 text-[#858a82]">استخدمي إضاءة طبيعية وألواناً هادئة لتبرزي جمال تنسيقات الزهور في كل صورة.</p>
                  <div className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold text-[#a37b51]"><span className="size-1.5 rounded-full bg-[#d2a473]" /> محتوى يلهم جمهورك</div>
                </section>
              </aside>
            </div>

            <HistorySection posts={filteredPosts} databaseAvailable={databaseAvailable} searchTerm={searchTerm} onDelete={handleDeletePost} deletingPostId={deletingPostId} actionError={historyError} actionNotice={historyNotice} />
            <footer className="px-1 py-7 text-center text-[10px] text-[#a2a39b]">صُنع بكل حب في بيت ورد <span className="text-[#c47f78]">♥</span></footer>
          </div>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-[#ece9e2] bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur-xl lg:hidden" aria-label="التنقل">
        <MobileNavItem href="#top" label="الرئيسية" icon={LayoutDashboard} active />
        <MobileNavItem href="/posts" label="المنشورات" icon={CalendarDays} />
        <MobileNavItem href="/channels" label="القنوات" icon={Send} />
        <MobileNavItem href="/settings" label="الإعدادات" icon={Settings2} />
      </nav>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-40 bg-[#26352d]/25 backdrop-blur-[2px] lg:hidden" onClick={() => setMobileMenuOpen(false)}>
          <nav role="dialog" aria-modal="true" aria-label="قائمة التنقل" className="absolute right-0 top-0 flex h-full w-[min(82vw,320px)] flex-col bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[#f0ede7] pb-5">
              <div className="flex items-center gap-3"><BrandMark size="size-10" /><div><p className="text-sm font-bold text-[#233b34]">{storeName}</p><p className="mt-1 text-[11px] text-[#92918b]">لوحة التسويق</p></div></div>
              <button type="button" onClick={() => setMobileMenuOpen(false)} className="rounded-lg p-2 text-[#777b75] hover:bg-[#f6f5f1]" aria-label="إغلاق القائمة"><X size={19} /></button>
            </div>
            <div className="mt-7 space-y-2">
              <MobileDrawerLink href="#top" label="نظرة عامة" icon={LayoutDashboard} onClick={() => setMobileMenuOpen(false)} />
              <MobileDrawerLink href="/posts" label="المنشورات" icon={CalendarDays} onClick={() => setMobileMenuOpen(false)} />
              <MobileDrawerLink href="/media" label="مكتبة الوسائط" icon={FolderOpen} onClick={() => setMobileMenuOpen(false)} />
              <MobileDrawerLink href="/channels" label="قنوات النشر" icon={Send} onClick={() => setMobileMenuOpen(false)} />
              <MobileDrawerLink href="/settings" label="الإعدادات" icon={Settings2} onClick={() => setMobileMenuOpen(false)} />
            </div>
            <p className="mt-auto text-center text-[10px] text-[#a2a39b]">صُنع بكل حب في بيت ورد ♥</p>
          </nav>
        </div>
      ) : null}
    </div>
  );
}

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatCard({ label, value, hint, icon: Icon, tint }: { label: string; value: number; hint: string; icon: typeof LayoutDashboard; tint: "sage" | "sand" | "mint" | "rose" }) {
  const tints = {
    sage: "bg-[#eff4ec] text-[#65806b]",
    sand: "bg-[#f8f1e6] text-[#a47c43]",
    mint: "bg-[#eaf4ee] text-[#4f8964]",
    rose: "bg-[#f9efeb] text-[#b67467]",
  };

  return (
    <article className="rounded-2xl border border-[#ece9e2] bg-white p-4 shadow-[0_4px_20px_rgba(42,53,44,0.025)] sm:rounded-[20px] sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <span className={`grid size-9 place-items-center rounded-xl ${tints[tint]}`}><Icon size={17} strokeWidth={1.8} /></span>
        <span className="hidden items-center gap-1 text-[10px] font-semibold text-[#8aab8e] sm:inline-flex"><ArrowUpLeft size={12} /> هذا الشهر</span>
      </div>
      <p className="mt-4 text-[11px] font-medium text-[#8e9189] sm:text-xs">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className="text-[25px] font-bold leading-8 tracking-tight text-[#2c3d33]">{value.toLocaleString("ar")}</p>
        <p className="hidden text-[10px] text-[#a3a49d] md:block">{hint}</p>
      </div>
    </article>
  );
}

function MobileNavItem({ href, label, icon: Icon, active = false }: { href: string; label: string; icon: typeof LayoutDashboard; active?: boolean }) {
  return (
    <a href={href} className={`flex flex-col items-center gap-1 rounded-xl py-1.5 text-[10px] font-semibold ${active ? "text-[#236151]" : "text-[#92958d]"}`}>
      <Icon size={19} strokeWidth={active ? 2.2 : 1.8} />
      <span>{label}</span>
    </a>
  );
}

function MobileDrawerLink({ href, label, icon: Icon, onClick }: { href: string; label: string; icon: typeof LayoutDashboard; onClick: () => void }) {
  return (
    <a href={href} onClick={onClick} className="flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium text-[#59635b] transition hover:bg-[#edf4ef] hover:text-[#17594c]">
      <Icon size={18} strokeWidth={1.8} />
      <span>{label}</span>
    </a>
  );
}
