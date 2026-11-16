"use client";

import Link from "next/link";
import { HEADER, type LandingIntent } from "@/content/marketing";
import { V2BrandLogo } from "@/components/v2/ui/V2BrandLogo";
import { useAuth } from "@/context/AuthContext";
import { trackCta } from "@/lib/track";
import { cn } from "@/lib/cn";

/**
 * `intent`: the landing page this header sits on, sent with the Sign up tap. `wide`: span the screen
 * like the landing page's edge-to-edge sections instead of the usual centered column. `tinted`: a little
 * more see-through, for the landing page, where lilac sits behind the bar and should show faintly.
 */
export function V2MarketingHeader({
  intent = "default",
  wide = false,
  tinted = false,
}: {
  intent?: LandingIntent;
  wide?: boolean;
  tinted?: boolean;
}) {
  const { user, loading } = useAuth();

  return (
    <header
      className={cn(
        "sticky top-0 z-40 shrink-0 border-b backdrop-blur-sm",
        tinted ? "border-v2-primary/10 bg-white/90" : "border-gray-200 bg-white/90",
      )}
    >
      <div className={cn("mx-auto flex w-full items-center justify-between gap-4 py-4", wide ? "px-5 sm:px-8 lg:px-12" : "v2-gutter-x max-w-6xl")}>
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
