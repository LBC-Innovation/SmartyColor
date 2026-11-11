"use client";

import Link from "next/link";
import { HEADER, type LandingIntent } from "@/content/marketing";
import { V2BrandLogo } from "@/components/v2/ui/V2BrandLogo";
import { useAuth } from "@/context/AuthContext";
import { trackCta } from "@/lib/track";

/** `intent`: the landing page this header sits on, sent with the Sign up tap. */
export function V2MarketingHeader({ intent = "default" }: { intent?: LandingIntent }) {
  const { user, loading } = useAuth();

  return (
    <header className="shrink-0 border-b border-gray-200 bg-white/90 backdrop-blur-sm">
      <div className="v2-gutter-x mx-auto flex w-full max-w-6xl items-center justify-between gap-4 py-4">
        <Link href="/" className="inline-flex min-h-11 min-w-0 items-center rounded-lg outline-offset-2">
          <V2BrandLogo />
        </Link>
        <nav className="flex shrink-0 items-center gap-2 sm:gap-3" aria-label="Account">
          {!loading && user ? (
            <Link
              href="/studio"
              className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-v2-link hover:underline"
            >
              {HEADER.signedIn}
            </Link>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-v2-link hover:underline lg:v2-btn-outline"
              >
                {HEADER.signIn}
              </Link>
              <Link
                href="/sign-up"
                onClick={() => trackCta("header", intent)}
                className="v2-btn-primary hidden text-sm lg:inline-flex"
              >
                {HEADER.signUp}
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
