import { FolderOpen } from "lucide-react";
import RoutePlaceholder from "@/components/route-placeholder";

export const metadata = { title: "مكتبة الوسائط | بيت ورد" };

export default function MediaPage() {
  return <RoutePlaceholder title="مكتبة الوسائط" description="سيظهر هنا معرض الصور والفيديوهات المرفوعة إلى Cloudinary. تتم معاينة الوسائط وإضافتها حالياً من نموذج إنشاء المنشور." icon={FolderOpen} />;
}
