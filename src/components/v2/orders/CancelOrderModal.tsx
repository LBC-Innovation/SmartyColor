"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { V2Modal } from "@/components/v2/ui/V2Modal";
import * as api from "@/lib/api/client";
import { formatCredits } from "@/lib/credits/money";

type Props = {
  orderId: string;
  title: string | null;
  /** What the order charged; returned to the wallet. */
  totalCents: number | null;
  /** When Lulu's production delay runs out, if known. */
  deadline?: string | null;
  /** Admin cancels go through the admin endpoint and talk about "the customer". */
  mode?: "customer" | "admin";
  /** Shown to admins so they know whose order this is. */
  customerLabel?: string | null;
  onClose: () => void;
  onCanceled: (result: api.CancelOrderData) => void;
};

function formatDeadline(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CancelOrderModal({
  orderId,
  title,
  totalCents,
  deadline,
  mode = "customer",
  customerLabel,
  onClose,
  onCanceled,
}: Props) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const admin = mode === "admin";
  const amount = totalCents != null && totalCents > 0 ? formatCredits(totalCents) : null;
  const bookName = title?.trim() || "this book";
  const reasonId = `cancel-reason-${orderId}`;

  async function confirm(): Promise<void> {
    setBusy(true);
    setError(null);
    const result = admin
      ? await api.adminCancelOrder(orderId, reason)
      : await api.cancelOrder(orderId, reason);
    setBusy(false);
    if (api.isError(result)) {
      setError(result.error.message);
      return;
    }
    onCanceled(result.data);
  }

  return (
    <V2Modal onClose={() => !busy && onClose()} maxWidthClass="max-w-md" ariaLabel="Cancel order">
      <div className="p-6">
        <div className="flex gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
            <AlertTriangle className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-v2-ink">Cancel “{bookName}”?</h2>
            {admin && customerLabel ? (
              <p className="mt-1 text-xs text-v2-muted">Customer: {customerLabel}</p>
            ) : null}
            <p className="mt-2 text-sm leading-relaxed text-v2-muted">Here&apos;s what happens:</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-v2-muted">
              <li>We stop the print job, so the book won&apos;t be printed or shipped.</li>
              <li>
                {amount
                  ? `${amount} goes back to ${admin ? "the customer's" : "your"} Colorful Memories wallet right away.`
                  : `Anything ${admin ? "the customer" : "you"} paid goes back to the wallet right away.`}
              </li>
              <li>
                {admin ? "The customer gets" : "You'll get"} an email confirming the cancellation. The book
                project stays in {admin ? "their" : "your"} account to order again later.
              </li>
            </ul>
            {deadline ? (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900">
                Orders can be canceled until production starts, around {formatDeadline(deadline)}.
              </p>
            ) : null}
            <p className="mt-2 text-xs text-v2-muted">This can&apos;t be undone.</p>
          </div>
        </div>

        <div className="mt-5">
          <label htmlFor={reasonId} className="text-sm font-medium text-v2-ink">
            {admin ? "Reason for canceling (shared with the customer)" : "Why are you canceling? (optional)"}
          </label>
          <textarea
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
            rows={3}
            disabled={busy}
            placeholder={admin ? "e.g. Customer asked to change the address" : "e.g. I want to change a few pages"}
            className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-v2-ink focus:border-v2-primary focus:outline-none focus:ring-2 focus:ring-v2-primary/20 disabled:opacity-60"
          />
        </div>

        {error ? (
          <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-v2-navy transition hover:bg-v2-bg-subtle disabled:cursor-not-allowed disabled:opacity-50"
          >
            Keep order
          </button>
          <button
            type="button"
            disabled={busy || (admin && !reason.trim())}
            onClick={() => void confirm()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Confirm cancel
          </button>
        </div>
      </div>
    </V2Modal>
  );
}
