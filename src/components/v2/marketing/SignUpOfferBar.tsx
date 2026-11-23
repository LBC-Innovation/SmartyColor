"use client";

import Link from "next/link";
import { ArrowRight, Gift } from "lucide-react";
import { OFFER_BAR, type LandingIntent } from "@/content/marketing";
import { useAuth } from "@/context/AuthContext";
import { fillCopy, type CopyValues } from "@/lib/marketing/copy";
import { trackCta } from "@/lib/track";

/**
 * The sign-up gift as a slim strip above the landing page header, so it is above the fold on every
 * screen without adding to the hero. Hidden when the gift is off and once a signed-in visitor is known.
 */
export function SignUpOfferBar({ values, intent }: { values: CopyValues; intent: LandingIntent }) {
  const { user } = useAuth();
  const text = fillCopy(OFFER_BAR.text, values);
  const short = fillCopy(OFFER_BAR.short, values);
  if (!text || !short || user) return null;
  return (
    <Link
      href="/sign-up"
      onClick={() => trackCta("offer_bar", intent)}
      className="group flex shrink-0 items-center justify-center gap-2 bg-v2-navy px-4 py-2 text-center text-xs font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white sm:py-1.5 sm:text-sm"
    >
      <Gift className="h-3.5 w-3.5 shrink-0 text-brand-amber" aria-hidden />
      <span className="sm:hidden">{short}</span>
      <span className="hidden sm:inline">{text}</span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 transition group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}
