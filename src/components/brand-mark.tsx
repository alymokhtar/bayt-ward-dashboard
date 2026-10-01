import Image from "next/image";

export default function BrandMark({ size = "size-12" }: { size?: "size-10" | "size-11" | "size-12" | "size-6" }) {
  return (
    <span className={`grid shrink-0 place-items-center ${size}`} aria-hidden="true">
      <Image src="/images/bayt-ward-logo.svg" alt="" width={48} height={48} className="size-full object-contain" />
    </span>
  );
}