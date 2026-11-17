"use client";

import { useState } from "react";
import { Clock, Loader2, Mail, PackageX, Printer, Wallet } from "lucide-react";
import { V2Modal, V2ModalActions, V2ModalBody } from "@/components/v2/ui/V2Modal";
import * as api from "@/lib/api/client";
import { formatCredits } from "@/lib/credits/money";
import {
  formatCancelDeadline,
  formatCountdown,
  useCancelCountdown,
} from "@/components/v2/orders/CancelCountdown";

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
  const { remainingMs, expired } = useCancelCountdown(deadline);
  // Admins see the deadline but aren't blocked by it; the server checks the printer either way.
  const closed = !admin && expired;

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
    <V2Modal
      onClose={() => !busy && onClose()}
      maxWidthClass="max-w-lg"
      tone="danger"
      icon={<PackageX />}
      title={`Cancel “${bookName}”?`}
      description={admin && customerLabel ? `Customer: ${customerLabel}` : "Here’s what happens:"}
    >
      <V2ModalBody className="space-y-4">
        {admin && customerLabel ? <p className="font-medium text-v2-ink">Here&apos;s what happens:</p> : null}
        <ul className="space-y-2.5 text-base leading-relaxed text-v2-ink">
          <li className="flex gap-3">
            <Printer className="mt-1 h-5 w-5 shrink-0 text-v2-primary" aria-hidden />
            <span>We stop the print job, so the book won&apos;t be printed or shipped.</span>
          </li>
          <li className="flex gap-3">
            <Wallet className="mt-1 h-5 w-5 shrink-0 text-v2-primary" aria-hidden />
            <span>
              {amount
                ? `${amount} goes back to ${admin ? "the customer's" : "your"} Colorful Memories wallet right away.`
                : `Anything ${admin ? "the customer" : "you"} paid goes back to the wallet right away.`}
            </span>
          </li>
          <li className="flex gap-3">
            <Mail className="mt-1 h-5 w-5 shrink-0 text-v2-primary" aria-hidden />
            <span>
              {admin ? "The customer gets" : "You'll get"} an email confirming the cancellation. The book project
              stays in {admin ? "their" : "your"} account to order again later.
            </span>
          </li>
        </ul>
        {deadline && closed ? (
          <p className="rounded-2xl bg-v2-bg-subtle px-4 py-3 text-base leading-relaxed text-v2-ink ring-1 ring-gray-200">
            The cancel window closed at {formatCancelDeadline(deadline)}, when your book went into production. It
            can no longer be canceled.
          </p>
        ) : deadline ? (
          <p className="flex gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-base leading-relaxed text-amber-950 ring-1 ring-amber-200">
            <Clock className="mt-1 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
            <span>
              Orders can be canceled until production starts, around {formatCancelDeadline(deadline)}
              {remainingMs != null && !expired ? (
                <>
                  {" "}
                  (<span className="font-semibold tabular-nums">{formatCountdown(remainingMs)}</span> left)
                </>
              ) : null}
              .
            </span>
          </p>
        ) : null}

        <div>
          <label htmlFor={reasonId} className="text-base font-semibold text-v2-ink">
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
            className="mt-2 w-full rounded-2xl border-2 border-gray-200 px-4 py-3 text-base text-v2-ink transition focus:border-v2-primary focus:outline-none focus:ring-4 focus:ring-v2-primary/15 disabled:opacity-60"
          />
        </div>

        {error ? (
          <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-base text-rose-800">
            {error}
          </p>
        ) : null}
        <p className="text-sm font-medium text-v2-muted">This can&apos;t be undone.</p>
      </V2ModalBody>

      <V2ModalActions>
        <button type="button" disabled={busy} onClick={onClose} className="v2-modal-btn v2-modal-btn--secondary">
          Keep order
        </button>
        <button
          type="button"
          disabled={busy || closed || (admin && !reason.trim())}
          onClick={() => void confirm()}
          className="v2-modal-btn v2-modal-btn--danger"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
          Confirm cancel
        </button>
      </V2ModalActions>
    </V2Modal>
  );
}
