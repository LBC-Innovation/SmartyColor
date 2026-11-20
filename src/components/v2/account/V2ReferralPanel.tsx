"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Gift } from "lucide-react";
import * as api from "@/lib/api/client";
import type { ReferralSummary } from "@/lib/credits/types";
import { formatUsd } from "@/lib/marketing/copy";

/** A pointer from the Account page to Share with a friend, with the current offer. */
export function V2ReferralPanel() {
  const [summary, setSummary] = useState<ReferralSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api.fetchReferral().then((res) => {
      if (!cancelled && !api.isError(res)) setSummary(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const friend = summary?.friendCreditCents ?? 0;
  const sharer = summary?.sharerCreditCents ?? 0;
  const offer =
    friend > 0 && sharer > 0
      ? `Give ${formatUsd(friend)}, get ${formatUsd(sharer)} when a friend signs up.`
      : sharer > 0
        ? `Get ${formatUsd(sharer)} when a friend signs up.`
        : friend > 0
          ? `Give a friend ${formatUsd(friend)} to get started.`
          : "Show a friend how it works.";

  return (
    <Link href="/share" className="v2-panel flex items-center gap-4 p-5 transition hover:bg-v2-bg-subtle sm:p-6">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-v2-primary-light text-v2-primary">
        <Gift className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-semibold text-v2-ink">Share with a friend</span>
        <span className="block text-sm text-v2-muted">{offer}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-v2-muted" aria-hidden />
    </Link>
  );
}
