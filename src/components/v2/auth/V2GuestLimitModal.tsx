"use client";

import Link from "next/link";
import { Gift, Sparkles } from "lucide-react";
import { V2Modal } from "@/components/v2/ui/V2Modal";
import { ACCOUNT_CREDIT_LINE, GUEST_GATES, GUEST_LIMIT } from "@/content/marketing";
import { withNextParam } from "@/lib/auth/nextPath";
import type { GuestLimitScope } from "@/lib/guestLimit";
import { fillCopy, formatUsd } from "@/lib/marketing/copy";
import { requestMigrationAfterSignup } from "@/lib/marketing/savePrompt";
import { useMarketingNumbers } from "@/lib/marketing/useMarketingNumbers";
import { STUDIO_PATH } from "@/lib/v2/guestSession";

/** A guest hit the daily limit: offer a free account, which also moves their pages across. */
export function V2GuestLimitModal({
  scope,
  kind,
  onClose,
}: {
  scope: GuestLimitScope;
  kind: "page" | "edit";
  onClose: () => void;
}) {
  const creditCents = useMarketingNumbers()?.welcomeCreditCents ?? null;
  const credit = creditCents != null ? fillCopy(ACCOUNT_CREDIT_LINE, { credit: formatUsd(creditCents) }) : null;
  const busy = scope === "global";
  const title = busy ? GUEST_LIMIT.busyTitle : kind === "edit" ? GUEST_LIMIT.editsTitle : GUEST_LIMIT.pagesTitle;

  return (
    <V2Modal onClose={onClose} maxWidthClass="max-w-sm" title={<h2 className="v2-brand-title text-lg text-v2-ink">{title}</h2>}>
      <div className="flex flex-col items-center gap-3 px-5 py-5 text-center sm:px-6">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-v2-primary-light text-v2-primary">
          <Sparkles className="h-6 w-6" aria-hidden />
        </span>
        <p className="text-sm leading-relaxed text-v2-muted">{busy ? GUEST_LIMIT.busyBody : GUEST_LIMIT.body}</p>
        {credit ? (
          <p className="inline-flex items-center gap-2 rounded-full border border-v2-primary/25 bg-v2-primary-light px-3.5 py-1.5 text-sm font-semibold text-v2-ink">
            <Gift className="h-4 w-4 shrink-0 text-v2-primary" aria-hidden />
            {credit}
          </p>
        ) : null}
        <Link
          href={withNextParam("/sign-up", STUDIO_PATH)}
          onClick={requestMigrationAfterSignup}
          className="v2-btn-primary mt-1 min-h-11 w-full text-base"
        >
          {GUEST_LIMIT.primary}
        </Link>
        <Link
          href={withNextParam("/sign-in", STUDIO_PATH)}
          onClick={requestMigrationAfterSignup}
          className="inline-flex min-h-11 items-center justify-center px-3 text-sm font-semibold text-v2-link hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary"
        >
          {GUEST_GATES.book.secondary}
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-11 items-center justify-center px-3 text-sm font-semibold text-v2-link hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary"
        >
          {GUEST_LIMIT.dismiss}
        </button>
      </div>
    </V2Modal>
  );
}
