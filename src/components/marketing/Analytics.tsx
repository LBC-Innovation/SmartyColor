"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { captureAttribution } from "@/lib/marketing/attribution";
import {
  TRACKING_IDS,
  anyTrackerConfigured,
  bootTrackers,
  hasOptedOut,
  trackPageView,
  urlHasSecrets,
} from "@/lib/track";

/**
 * Loads GA4, Meta Pixel and the Pinterest tag (each only when its id is set), sends a page view
 * on every route change, and records campaign tags from the URL. Nothing loads for visitors who
 * opted out or send Global Privacy Control, or while the URL holds a sign-in secret.
 */
export function Analytics() {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(false);
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    captureAttribution();
    if (!anyTrackerConfigured() || hasOptedOut() || urlHasSecrets()) return;
    bootTrackers();
    if (lastPath.current !== pathname) {
      lastPath.current = pathname;
      trackPageView();
    }
    // The vendor scripts mount once tracking is allowed on this visit.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnabled(true);
  }, [pathname]);

  if (!enabled) return null;
  const { ga4, meta, pinterest } = TRACKING_IDS;

  return (
    <>
      {ga4 ? <Script src={`https://www.googletagmanager.com/gtag/js?id=${ga4}`} strategy="afterInteractive" /> : null}
      {meta ? <Script src="https://connect.facebook.net/en_US/fbevents.js" strategy="afterInteractive" /> : null}
      {pinterest ? <Script src="https://s.pinimg.com/ct/core.js" strategy="afterInteractive" /> : null}
    </>
  );
}
