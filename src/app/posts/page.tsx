import { CalendarDays } from "lucide-react";
import RoutePlaceholder from "@/components/route-placeholder";

export const metadata = { title: "المنشورات | بيت ورد" };

export default function PostsPage() {
  return <RoutePlaceholder title="المنشورات" description="ستجدين هنا جدولة المنشورات ومتابعة عمليات النشر. يمكنك الآن إنشاء المنشورات من الصفحة الرئيسية ومراجعة سجلها هناك." icon={CalendarDays} />;
}
