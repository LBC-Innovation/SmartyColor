"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { V2MarketingHeader } from "@/components/v2/marketing/V2MarketingHeader";

/** Page frame shared by sign-in, sign-up and password recovery. */
export function V2AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-v2-bg">
      <V2MarketingHeader />

      <main className="flex flex-1 flex-col items-center justify-center px-5 py-8 sm:py-12">
        {children}

        <Link
          href="/"
          className="mt-6 inline-flex min-h-11 items-center text-sm font-medium text-v2-muted hover:text-v2-link"
        >
          ← Back to home
        </Link>
      </main>
    </div>
  );
}

/**
 * The h1 of a screen that replaces the one before it (after a submit). It takes focus when it
 * appears, so a screen reader announces the new screen instead of staying on a removed button.
 */
export function V2AuthHeading({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <h1 ref={ref} tabIndex={-1} className={`${className ?? ""} focus:outline-none`}>
      {children}
    </h1>
  );
}
