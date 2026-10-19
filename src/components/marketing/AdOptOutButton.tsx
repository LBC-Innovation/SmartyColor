"use client";

import { useEffect, useState } from "react";
import { hasOptedOut, setAdOptOut } from "@/lib/track";
import { cn } from "@/lib/cn";

/** "Do not sell or share my personal information": sets the opt-out cookie the tracker honors. */
export function AdOptOutButton({ className, showOptIn = false }: { className?: string; showOptIn?: boolean }) {
  const [optedOut, setOptedOut] = useState<boolean | null>(null);

  useEffect(() => {
    // The cookie is only readable in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOptedOut(hasOptedOut());
  }, []);

  if (optedOut && !showOptIn) {
    return <span className={cn("text-v2-muted", className)}>Opted out of sale and sharing</span>;
  }

  return (
    <button
      type="button"
      className={cn("text-left font-semibold underline-offset-4 hover:underline", className)}
      onClick={() => {
        const next = !optedOut;
        setAdOptOut(next);
        setOptedOut(next);
      }}
    >
      {optedOut ? "You're opted out. Opt back in" : "Do not sell or share my personal information"}
    </button>
  );
}
