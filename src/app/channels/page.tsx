import { Send } from "lucide-react";
import RoutePlaceholder from "@/components/route-placeholder";

export const metadata = { title: "قنوات النشر | بيت ورد" };

export default function ChannelsPage() {
  return <RoutePlaceholder title="قنوات النشر" description="إدارة الربط والنشر المباشر عبر منصات التواصل قيد التجهيز. يمكنك إعداد معرّفات الحسابات من صفحة الإعدادات." icon={Send} />;
}
