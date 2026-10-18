"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Gift, Loader2 } from "lucide-react";
import * as api from "@/lib/api/client";
import { formatCredits } from "@/lib/credits/money";
import type { ReferralSummary } from "@/lib/credits/types";

/** The account's refer-a-friend link: share it, and both sides get credit on the friend's first order. */
export function V2ReferralPanel() {
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api.fetchReferral().then((res) => {
      if (cancelled) return;
      if (api.isError(res)) setError(res.error.message);
      else setSummary(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the field is selectable */
    }
  }

  // With the credit turned off there is nothing to offer.
  if (summary && summary.creditCents <= 0 && summary.referredCount === 0) return null;

  return (
    <section className="v2-panel p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-v2-ink">
        <Gift className="h-5 w-5 text-v2-success-text" aria-hidden />
        Give {summary ? formatCredits(summary.creditCents) : "credit"}, get{" "}
        {summary ? formatCredits(summary.creditCents) : "credit"}
      </h2>
      {error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : !summary ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-v2-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading…
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm leading-relaxed text-v2-muted">
            Share your link. When a friend who signs up through it places their first order, you each
            get {formatCredits(summary.creditCents)} of credit.
          </p>
          <div className="mt-4 flex gap-2">
            <input
              readOnly
              value={summary.url}
              aria-label="Your referral link"
              className="v2-input min-w-0 flex-1 text-sm"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button type="button" onClick={() => void copy(summary.url)} className="v2-btn-outline shrink-0 px-4 text-sm">
              {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          {summary.referredCount > 0 ? (
            <p className="mt-3 text-sm text-v2-ink">
              {summary.referredCount === 1 ? "1 friend has" : `${summary.referredCount} friends have`} ordered
              so far · you&apos;ve earned {formatCredits(summary.earnedCents)}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
