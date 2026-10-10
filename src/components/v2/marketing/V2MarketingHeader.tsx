"use client";

import Link from "next/link";
import { V2BrandLogo } from "@/components/v2/ui/V2BrandLogo";
import { useAuth } from "@/context/AuthContext";

export function V2MarketingHeader() {
  const { user, loading } = useAuth();

  return (
    <header className="shrink-0 border-b border-gray-200 bg-white/90 backdrop-blur-sm">
      <div className="v2-gutter-x mx-auto flex w-full max-w-6xl items-center justify-between gap-4 py-4">
        <Link href="/" className="min-w-0 rounded-lg outline-offset-2">
          <V2BrandLogo />
        </Link>
        <nav className="flex shrink-0 items-center gap-2 sm:gap-3" aria-label="Account">
          {!loading && user ? (
            <Link href="/studio" className="v2-btn-primary text-sm">
              Open studio
            </Link>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="inline-flex h-10 items-center px-2 text-sm font-semibold text-v2-link hover:underline lg:v2-btn-outline"
              >
                Sign in
              </Link>
              <Link href="/sign-up" className="v2-btn-primary hidden text-sm lg:inline-flex">
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
