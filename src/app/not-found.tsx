import type { Metadata } from "next";
import Link from "next/link";
import { AuthProvider } from "@/context/AuthContext";
import { PRIMARY_CTA } from "@/content/marketing";
import { V2MarketingHeader } from "@/components/v2/marketing/V2MarketingHeader";

export const metadata: Metadata = {
  title: "Page not found | Colorful Memories",
  robots: { index: false },
};

/** Shown for any address that doesn't exist. Only the account provider is needed for the header. */
export default function NotFound() {
  return (
    <div className="v2-shell flex min-h-dvh flex-col bg-v2-bg text-v2-ink">
      <AuthProvider>
        <V2MarketingHeader />
      </AuthProvider>
      <main className="flex flex-1 flex-col items-center justify-center px-5 py-12 text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-v2-muted">Error 404</p>
        <h1 className="v2-brand-title mt-2 text-3xl text-v2-ink sm:text-4xl">We can&apos;t find that page</h1>
        <p className="mt-3 max-w-sm text-base leading-relaxed text-v2-muted">
          The link may be old or mistyped. Head back home, or make a coloring page from one of your photos.
        </p>
        <div className="mt-8 flex w-full max-w-xs flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
          <Link href="/studio" className="v2-btn-primary min-h-11 px-6 text-base">
            {PRIMARY_CTA}
          </Link>
          <Link href="/" className="v2-btn-outline min-h-11 px-6 text-base">
            Go to home
          </Link>
        </div>
      </main>
    </div>
  );
}
