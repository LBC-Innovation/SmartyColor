"use client";

import Link from "next/link";
import { useState } from "react";
import { ExternalLink, Loader2, RotateCcw, XCircle } from "lucide-react";
import { Drawer } from "@/components/v2/admin/Drawer";
import { fullDateTime, money, percent, shortId } from "@/components/v2/admin/format";
import { orderAttention, orderMoney } from "@/components/v2/admin/orderAttention";
import { Callout, DefinitionList } from "@/components/v2/admin/ui";
import { bookLabelLong, customerLabel, OrderStatusPill, orderTitle } from "@/components/v2/admin/orders/orderDisplay";
import { CancelOrderModal } from "@/components/v2/orders/CancelOrderModal";
import * as api from "@/lib/api/client";
import { adminCanCancel } from "@/lib/orders/cancelWindow";
import type { AdminUserOrderSummary } from "@/lib/orders/adminTypes";

const UNPAID = new Set(["draft", "quoted", "awaiting_payment"]);

export function OrderDrawer({
  order,
  canViewCustomers,
  onClose,
  onChanged,
}: {
  order: AdminUserOrderSummary;
  canViewCustomers: boolean;
  onClose: () => void;
  /** After a cancel or resubmit: reload the list and the badges. */
  onChanged: () => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [resubmitting, setResubmitting] = useState(false);
  const [notice, setNotice] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  const attention = orderAttention(order);
  const m = orderMoney(order);
  const cancelable = adminCanCancel(order);
  const failed = order.status === "failed";
  const customer = customerLabel(order);
  const isPrint = order.fulfillment === "print";

  async function resubmit() {
    setResubmitting(true);
    setNotice(null);
    const result = await api.adminSubmitOrderToLulu(order.id);
    setResubmitting(false);
    if (api.isError(result)) {
      setNotice({ tone: "bad", text: `Couldn't resubmit: ${result.error.message}` });
      return;
    }
    setNotice({
      tone: "good",
      text: result.data.luluPrintJobId ? `Sent to the printer as Lulu job #${result.data.luluPrintJobId}.` : "Sent to the printer.",
    });
    onChanged();
  }

  const customerValue = customer ? (
    canViewCustomers && order.userId ? (
      <Link href={`/admin/users?user=${order.userId}`} className="font-semibold text-v2-link hover:underline">
        {customer}
      </Link>
    ) : (
      customer
    )
  ) : (
    <span className="font-normal text-v2-muted">Deleted account</span>
  );

  return (
    <>
      <Drawer
        onClose={onClose}
        title={orderTitle(order)}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-xs">{shortId(order.id)}</span>
            <span aria-hidden>·</span>
            <span>placed {fullDateTime(order.createdAt)}</span>
            <OrderStatusPill order={order} />
          </span>
        }
        headerActions={
          <Link
            href={`/orders/${order.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-1 text-sm font-semibold text-v2-link hover:underline sm:inline-flex"
          >
            Open customer view
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </Link>
        }
        footer={
          failed || cancelable ? (
            <>
              {failed ? (
                <button type="button" className="v2-btn-outline" onClick={() => void resubmit()} disabled={resubmitting}>
                  {resubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                  ) : (
                    <RotateCcw className="h-4 w-4" aria-hidden />
                  )}
                  Resubmit to printer
                </button>
              ) : null}
              {cancelable ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-5 py-2.5 text-sm font-bold text-red-700 transition hover:bg-red-100"
                  onClick={() => setCancelling(true)}
                >
                  <XCircle className="h-4 w-4" aria-hidden />
                  Cancel and refund
                </button>
              ) : null}
            </>
          ) : undefined
        }
      >
        <div className="space-y-6">
          {notice ? (
            <p
              role="status"
              className={
                notice.tone === "good"
                  ? "rounded-lg border border-v2-success-border bg-v2-success-bg px-3 py-2 text-sm text-v2-success-text"
                  : "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
              }
            >
              {notice.text}
            </p>
          ) : null}

          {attention ? (
            <Callout tone={attention.tone} title={attention.tone === "critical" ? "This order needs you" : "Keep an eye on this order"}>
              {attention.reason}
            </Callout>
          ) : null}

          <section aria-labelledby="order-facts">
            <h3 id="order-facts" className="v2-section-title mb-1">
              Order
            </h3>
            <DefinitionList
              items={[
                { label: "Customer", value: customerValue },
                { label: "Book", value: <span className="font-normal">{bookLabelLong(order)}</span> },
                ...(isPrint
                  ? [
                      {
                        label: "Printer job",
                        value: order.luluPrintJobId ? (
                          <span className="font-normal">
                            Lulu #{order.luluPrintJobId}
                            {order.luluStatusName ? ` · ${order.luluStatusName}` : ""}
                          </span>
                        ) : (
                          <span className="font-normal text-v2-muted">Not sent yet</span>
                        ),
                      },
                    ]
                  : []),
                ...(cancelable && order.luluProductionDueAt
                  ? [{ label: "Cancelable until", value: <span className="font-normal">{fullDateTime(order.luluProductionDueAt)}</span> }]
                  : []),
                ...(order.canceledAt ? [{ label: "Canceled", value: <span className="font-normal">{fullDateTime(order.canceledAt)}</span> }] : []),
              ]}
            />
          </section>

          <section aria-labelledby="order-money">
            <h3 id="order-money" className="v2-section-title mb-1">
              Money
            </h3>
            {UNPAID.has(order.status) ? (
              <p className="py-2 text-sm text-v2-muted">Not paid yet, so nothing has been charged.</p>
            ) : (
              <DefinitionList
                items={[
                  ...(order.subtotalCents != null ? [{ label: "Book", value: money(order.subtotalCents) }] : []),
                  ...(isPrint && order.shippingCents != null ? [{ label: "Shipping", value: money(order.shippingCents) }] : []),
                  ...(isPrint && order.taxCents != null ? [{ label: "Sales tax", value: money(order.taxCents) }] : []),
                  { label: "Charged", value: money(m.chargedCents) },
                  {
                    label: isPrint ? "Our cost (Lulu)" : "Our cost",
                    note: isPrint ? "Printing, shipping and tax the printer charges us" : "A download costs almost nothing to make",
                    value: isPrint ? money(m.costCents) : "—",
                  },
                  {
                    label: "Margin",
                    note: "Charged minus our cost; % is of the charge before tax",
                    value: m.marginCents == null ? "—" : `${money(m.marginCents)} (${percent(m.marginPct)})`,
                    tone: m.marginCents != null && m.marginCents < 0 ? ("bad" as const) : undefined,
                  },
                  ...(order.refundedCents ? [{ label: "Refunded to wallet", value: money(order.refundedCents) }] : []),
                ]}
              />
            )}
          </section>

          {order.cancelReason ? (
            <section aria-labelledby="order-cancel">
              <h3 id="order-cancel" className="v2-section-title mb-1">
                Cancel reason
              </h3>
              <p className="text-sm text-v2-navy">“{order.cancelReason}”</p>
            </section>
          ) : null}

          <Link
            href={`/orders/${order.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-semibold text-v2-link hover:underline sm:hidden"
          >
            Open customer view
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </Link>
        </div>
      </Drawer>

      {cancelling ? (
        <CancelOrderModal
          mode="admin"
          orderId={order.id}
          title={order.projectTitle}
          totalCents={UNPAID.has(order.status) ? null : order.totalCents}
          deadline={order.luluProductionDueAt}
          customerLabel={customer}
          onClose={() => setCancelling(false)}
          onCanceled={(result) => {
            setCancelling(false);
            setNotice({
              tone: "good",
              text:
                result.refundedCents > 0
                  ? `Order canceled; ${money(result.refundedCents)} returned to the customer's wallet.`
                  : "Order canceled.",
            });
            onChanged();
          }}
        />
      ) : null}
    </>
  );
}
