"use client";

import { useMemo, useState } from "react";
import { Gift, Loader2, Wallet } from "lucide-react";
import { V2AddCreditModal } from "@/components/v2/credits/V2AddCreditModal";
import { recheckTopUp, useTopUpStatus } from "@/components/v2/credits/useCreditCheckoutReturn";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/lib/api/client";
import { formatCredits } from "@/lib/credits/money";
import type { BookOrderDetail } from "@/lib/orders/types";
import { centsToValue, trackFormatForProduct } from "@/lib/marketing/events";
import { trackPurchaseOnce } from "@/lib/track";
import { HOLIDAY_LINE } from "@/content/marketing";
import { fillCopy } from "@/lib/marketing/copy";
import { holidayOrderBy } from "@/lib/marketing/holiday";

type Props = {
  order: BookOrderDetail;
  onOrderUpdated: () => void | Promise<void>;
  /** Called after a successful placement, so the page can show its thank-you view. */
  onPlaced?: () => void;
};

export function BookOrderCheckoutPanel({ order, onOrderUpdated, onPlaced }: Props) {
  const { user, refreshUser } = useAuth();
  const [placing, setPlacing] = useState(false);
  const [addCreditOpen, setAddCreditOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const topUp = useTopUpStatus();

  const totalCents = order.totalCents;
  // The album's purchase code pays `coveredCents`; the wallet pays what is left.
  const dueCents = totalCents != null ? Math.max(0, totalCents - order.coveredCents) : null;
  const holiday = holidayOrderBy();
  const holidayLine = holiday ? fillCopy(HOLIDAY_LINE, { date: holiday.label }) : null;
  const balanceCents = user?.creditsBalanceCents ?? 0;

  const { shortfallCents, canPlace } = useMemo(() => {
    if (totalCents == null || totalCents <= 0) {
      return { shortfallCents: 0, canPlace: false };
    }
    const shortfall = Math.max(0, (dueCents ?? totalCents) - balanceCents);
    return { shortfallCents: shortfall, canPlace: shortfall === 0 };
  }, [totalCents, dueCents, balanceCents]);

  async function handlePlaceOrder() {
    setPlacing(true);
    setError(null);
    const result = await api.placeBookOrder(order.id);
    setPlacing(false);
    if (api.isError(result)) {
      setError(result.error.message);
      if (result.error.code === "INSUFFICIENT_CREDITS") {
        void refreshUser();
      }
      return;
    }
    trackPurchaseOnce({
      value: centsToValue(order.totalCents ?? 0),
      currency: "USD",
      order_id: order.id,
      format: trackFormatForProduct(order.productId),
      is_gift: order.isGift,
    });
    await refreshUser();
    if (order.fulfillment !== "digital") onPlaced?.();
    await onOrderUpdated();
  }

  return (
    <section className="v2-panel mb-4 border-v2-primary/25 p-4 sm:p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-v2-muted">
        Place order
      </h2>
      <p className="mt-2 text-sm text-v2-muted">
        This order is paid from your wallet balance.{" "}
        {order.fulfillment === "digital"
          ? "Once it's placed, your PDF is ready to download."
          : "Once it's placed, we send your book to the printer."}
      </p>

      {holidayLine && order.fulfillment !== "digital" ? (
        <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-v2-navy">
          <Gift className="h-4 w-4 shrink-0 text-v2-primary" aria-hidden />
          {holidayLine}
        </p>
      ) : null}

      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-lg bg-v2-bg-subtle px-3 py-2">
          <dt className="text-xs font-semibold uppercase tracking-wider text-v2-muted">
            Your wallet balance
          </dt>
          <dd className="mt-1 font-semibold tabular-nums text-v2-ink">
            {formatCredits(balanceCents)}
          </dd>
        </div>
        <div className="rounded-lg bg-v2-bg-subtle px-3 py-2">
          <dt className="text-xs font-semibold uppercase tracking-wider text-v2-muted">
            Order total
          </dt>
          <dd className="mt-1 font-semibold tabular-nums text-v2-ink">
            {totalCents != null ? formatCredits(totalCents) : "—"}
          </dd>
        </div>
        {order.coveredCents > 0 ? (
          <div className="rounded-lg bg-v2-bg-subtle px-3 py-2 sm:col-span-2">
            <dt className="text-xs font-semibold uppercase tracking-wider text-v2-muted">Paid by your purchase code</dt>
            <dd className="mt-1 font-semibold tabular-nums text-v2-success-text">
              −{formatCredits(order.coveredCents)}
              <span className="ml-2 font-normal text-v2-muted">
                {dueCents ? `${formatCredits(dueCents)} extra is yours to pay` : "Nothing more to pay"}
              </span>
            </dd>
          </div>
        ) : null}
      </dl>

      {shortfallCents > 0 ? (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
          You need <span className="font-semibold tabular-nums">{formatCredits(shortfallCents)}</span>{" "}
          more.
        </p>
      ) : null}

      <p role="status" className="sr-only">
        {placing ? "Placing your order…" : ""}
      </p>

      {error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {shortfallCents > 0 && topUp.kind === "confirming" ? (
          // Back from Stripe, credit not on the balance yet: no second pay button meanwhile.
          <button type="button" className="v2-btn-primary min-h-11 w-full text-sm sm:w-auto" disabled aria-busy>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Confirming your payment…
          </button>
        ) : shortfallCents > 0 && (topUp.kind === "slow" || topUp.kind === "bank") ? (
          <>
            <p className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">
              {topUp.kind === "bank"
                ? `Your ${formatCredits(topUp.amountCents)} is on its way from your bank, which can take a few days. Place the order once it arrives.`
                : "We're still confirming your payment. If you were charged, it will show up in your wallet balance shortly, so please don't pay again yet."}
            </p>
            {topUp.kind === "slow" ? (
              <button type="button" className="v2-btn-primary min-h-11 w-full text-sm sm:w-auto" onClick={recheckTopUp}>
                Check again
              </button>
            ) : null}
            <button
              type="button"
              className="v2-btn-outline min-h-11 w-full text-sm sm:w-auto"
              onClick={() => setAddCreditOpen(true)}
            >
              {topUp.kind === "bank" ? "Pay by card instead" : "Add to wallet again"}
            </button>
          </>
        ) : shortfallCents > 0 ? (
          <button
            type="button"
            className="v2-btn-primary min-h-11 w-full text-sm sm:w-auto"
            onClick={() => setAddCreditOpen(true)}
          >
            <Wallet className="h-4 w-4" aria-hidden />
            Pay {formatCredits(shortfallCents)} and continue
          </button>
        ) : (
          <>
            <button
              type="button"
              className="v2-btn-primary min-h-11 w-full text-sm sm:w-auto"
              disabled={!canPlace || placing || totalCents == null}
              onClick={() => void handlePlaceOrder()}
            >
              {placing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {dueCents != null && dueCents > 0 ? `Place order · ${formatCredits(dueCents)}` : "Place order"}
            </button>
            {canPlace ? (
              <button
                type="button"
                className="v2-btn-outline min-h-11 w-full text-sm sm:w-auto"
                onClick={() => setAddCreditOpen(true)}
              >
                Add more to wallet
              </button>
            ) : null}
          </>
        )}
      </div>

      {addCreditOpen ? (
        <V2AddCreditModal
          onClose={() => setAddCreditOpen(false)}
          shortfallCents={shortfallCents}
          returnPath={`/orders/${order.id}`}
        />
      ) : null}
    </section>
  );
}
