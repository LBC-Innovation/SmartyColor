"use client";

import Link from "next/link";
import { Gift, Sparkles } from "lucide-react";
import { V2Modal } from "@/components/v2/ui/V2Modal";
import { ACCOUNT_CREDIT_LINE, GUEST_GATES, GUEST_LIMIT } from "@/content/marketing";
import { withNextParam } from "@/lib/auth/nextPath";
import type { GuestLimitScope } from "@/lib/guestLimit";
import { fillCopy, formatFreeSheets } from "@/lib/marketing/copy";
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
  const freeSheets = useMarketingNumbers()?.welcomeFreeSheets ?? null;
  const credit = freeSheets != null ? fillCopy(ACCOUNT_CREDIT_LINE, { freeSheets: formatFreeSheets(freeSheets) }) : null;
  const busy = scope === "global";
  const title = busy ? GUEST_LIMIT.busyTitle : kind === "edit" ? GUEST_LIMIT.editsTitle : GUEST_LIMIT.pagesTitle;

  return (
    <V2Modal
      onClose={onClose}
      maxWidthClass="max-w-md"
      icon={<Sparkles />}
      title={title}
      description={busy ? GUEST_LIMIT.busyBody : GUEST_LIMIT.body}
    >
      <div className="flex flex-col items-stretch gap-2 px-5 pb-6 pt-1 text-center sm:px-7">
        {credit ? (
          <p className="mb-2 inline-flex items-center justify-center gap-2 self-center rounded-full border border-v2-primary/25 bg-v2-primary-light px-4 py-2 text-base font-semibold text-v2-ink">
            <Gift className="h-4 w-4 shrink-0 text-v2-primary" aria-hidden />
            {credit}
          </p>
        ) : null}
        <Link
          href={withNextParam("/sign-up", STUDIO_PATH)}
          onClick={requestMigrationAfterSignup}
          className="v2-modal-btn v2-modal-btn--primary w-full"
        >
          {GUEST_LIMIT.primary}
        </Link>
        <Link
          href={withNextParam("/sign-in", STUDIO_PATH)}
          onClick={requestMigrationAfterSignup}
          className="inline-flex min-h-11 items-center justify-center px-3 text-base font-semibold text-v2-link hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary"
        >
          {GUEST_GATES.book.secondary}
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-11 items-center justify-center px-3 text-base font-semibold text-v2-link hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v2-primary"
        >
          {GUEST_LIMIT.dismiss}
        </button>
      </div>
    </V2Modal>
  );
}
