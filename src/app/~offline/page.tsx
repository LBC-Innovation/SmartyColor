import Link from "next/link";
import { V2BrandMark } from "@/components/v2/ui/V2BrandLogo";

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#fbfbfc] px-6 text-center text-[#0a101a]">
      <V2BrandMark size={72} />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">You&apos;re offline</h1>
      <p className="mt-2 max-w-sm text-base leading-relaxed text-[#5c6478]">
        ColorfulMemories needs an internet connection to make new coloring pages. Projects saved on
        this device will be here when you reconnect.
      </p>
      <Link
        href="/studio"
        className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-[#564fd0] px-6 text-sm font-bold text-white"
      >
        Try again
      </Link>
    </div>
  );
}
