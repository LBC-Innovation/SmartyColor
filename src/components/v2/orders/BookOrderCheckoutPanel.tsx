"use client";

import { useMemo, useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import { V2AddCreditModal } from "@/components/v2/credits/V2AddCreditModal";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/lib/api/client";
import { formatCredits } from "@/lib/credits/money";
import type { BookOrderDetail } from "@/lib/orders/types";

type Props = {
  order: BookOrderDetail;
  onOrderUpdated: () => void | Promise<void>;
};

export function BookOrderCheckoutPanel({ order, onOrderUpdated }: Props) {
  const { user, refreshUser } = useAuth();
  const [placing, setPlacing] = useState(false);
  const [addCreditOpen, setAddCreditOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalCents = order.totalCents;
  const balanceCents = user?.creditsBalanceCents ?? 0;

  const { shortfallCents, canPlace } = useMemo(() => {
    if (totalCents == null || totalCents <= 0) {
      return { shortfallCents: 0, canPlace: false };
    }
    const shortfall = Math.max(0, totalCents - balanceCents);
    return { shortfallCents: shortfall, canPlace: shortfall === 0 };
  }, [totalCents, balanceCents]);

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
    await refreshUser();
    await onOrderUpdated();
  }

  return (
    <section className="v2-panel mb-4 border-v2-primary/25 p-4 sm:p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-v2-muted">
        Place order
      </h2>
      <p className="mt-2 text-sm text-v2-muted">
        Pay with your promo wallet balance. Your print job is already registered — placing the
        order charges credits and sends the book to production.
      </p>

      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-lg bg-v2-bg-subtle px-3 py-2">
          <dt className="text-xs font-semibold uppercase tracking-wider text-v2-muted">
            Your balance
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
      </dl>

      {shortfallCents > 0 ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
          <p>
            You need{" "}
            <span className="font-semibold tabular-nums">{formatCredits(shortfallCents)}</span>{" "}
            more to place this order.
          </p>
          <button
            type="button"
            className="v2-btn-primary mt-3 text-sm"
            onClick={() => setAddCreditOpen(true)}
          >
            <Wallet className="h-4 w-4" aria-hidden />
            Add {formatCredits(shortfallCents)} credit
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="v2-btn-primary text-sm"
          disabled={!canPlace || placing || totalCents == null}
          onClick={() => void handlePlaceOrder()}
        >
          {placing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Place order
        </button>
        {canPlace ? (
          <button type="button" className="v2-btn-outline text-sm" onClick={() => setAddCreditOpen(true)}>
            Add more credit
          </button>
        ) : null}
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
