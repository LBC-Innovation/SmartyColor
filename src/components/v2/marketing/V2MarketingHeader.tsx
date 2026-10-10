"use client";

import Link from "next/link";
import { BookOpen } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export function V2MarketingHeader() {
  const { user, loading } = useAuth();

  return (
    <header className="shrink-0 border-b border-gray-200 bg-white/90 backdrop-blur-sm">
      <div className="v2-gutter-x mx-auto flex w-full max-w-6xl items-center justify-between gap-4 py-4">
        <Link href="/" className="flex min-w-0 items-center gap-2.5 rounded-lg outline-offset-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-v2-primary-light text-v2-primary">
            <BookOpen className="h-5 w-5" strokeWidth={2.25} aria-hidden />
          </span>
          <span className="v2-brand-title truncate text-lg text-v2-ink sm:text-xl">
            ColorfulMoments
          </span>
        </Link>
        <nav className="flex shrink-0 items-center gap-2 sm:gap-3" aria-label="Account">
          {!loading && user ? (
            <Link href="/studio" className="v2-btn-primary text-sm">
              Open studio
            </Link>
          ) : (
            <>
              <Link href="/sign-in" className="v2-btn-outline hidden text-sm sm:inline-flex">
                Sign in
              </Link>
              <Link href="/sign-up" className="v2-btn-primary text-sm">
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
