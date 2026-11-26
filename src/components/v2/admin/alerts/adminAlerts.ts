import { fullDateTime, money, shortId, usd4FromCents } from "@/components/v2/admin/format";
import { aiHealth } from "@/components/v2/admin/aiHealth";
import { orderAttention } from "@/components/v2/admin/orderAttention";
import { customerLabel, bookLabelLong, orderTitle } from "@/components/v2/admin/orders/orderDisplay";
import { draftFor, previewPrice } from "@/components/v2/admin/pricing/pricingMath";
import { statusLabel } from "@/lib/orders/fulfillmentTimeline";
import type { FinanceReport } from "@/lib/finance/types";
import type { AdminUserOrderSummary } from "@/lib/orders/adminTypes";
import type { AdminPricingData } from "@/lib/pricing/types";

/**
 * Admin alerts: everything that needs the owner, from every admin page, in one list. The alerts
 * column beside the admin nav shows the unread ones; /admin/alerts?alert=<key> reads one.
 *
 * Alerts are computed live from their sources. `key` names the alert and the state it is in, so an
 * alert marked read stays read only while nothing about it changes: an order that moves to another
 * status, a newer image service error or a new price comes back as a new alert.
 */

export type AlertSource = "orders" | "ai" | "pricing" | "finance";

export type AdminAlert = {
  key: string;
  source: AlertSource;
  tone: "critical" | "warning";
  title: string;
  /** One line for the column. */
  summary: string;
  /** The full story, for the reading pane. */
  body: string[];
  facts: Array<{ label: string; value: string }>;
  /** When the problem started or was last seen, if known. */
  at: string | null;
  href: string;
  actionLabel: string;
};

export const SOURCE_LABEL: Record<AlertSource, string> = {
  orders: "Orders",
  ai: "Image service",
  pricing: "Pricing",
  finance: "Finance",
};

export type AiErrorLike = { at: string; kind: string; operation?: string; message?: string; httpStatus?: number | null };

export type AlertSources = {
  orders: AdminUserOrderSummary[] | null;
  ai: { errors: AiErrorLike[]; calls: Array<{ at: string }> } | null;
  pricing: AdminPricingData | null;
  finance: FinanceReport | null;
};

const AI_TITLE: Record<"billing" | "auth" | "quota", string> = {
  billing: "Image service billing problem",
  auth: "Image service rejected our key",
  quota: "Image service hit its usage limit",
};

const AI_BODY: Record<"billing" | "auth" | "quota", string> = {
  billing: "New coloring pages and edits are failing for customers until the billing problem is fixed with the provider.",
  auth: "New coloring pages and edits are failing for customers until the API key is fixed.",
  quota: "Some calls hit the provider's usage limit, so some pages may fail until it resets.",
};

/** Calendar month, so a finance finding marked read comes back next month if it's still true. */
function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export function buildAdminAlerts(src: AlertSources, now: number): AdminAlert[] {
  const out: AdminAlert[] = [];

  for (const o of src.orders ?? []) {
    const a = orderAttention(o, now);
    if (!a) continue;
    const customer = customerLabel(o);
    out.push({
      key: `order:${o.id}:${o.status}`,
      source: "orders",
      tone: a.tone,
      title: `Order ${shortId(o.id)} · ${orderTitle(o)}`,
      summary: a.reason,
      body: [a.reason, o.luluStatusName ? `The printer's last status: ${o.luluStatusName}.` : null].filter((x): x is string => Boolean(x)),
      facts: [
        { label: "Status", value: statusLabel(o.status) },
        { label: "Customer", value: customer ?? "Deleted account" },
        { label: "Book", value: bookLabelLong(o) },
        { label: "Charged", value: money(o.totalCents) },
        { label: "Placed", value: fullDateTime(o.createdAt) },
      ],
      at: o.createdAt,
      href: `/admin/orders?order=${o.id}`,
      actionLabel: "Open the order",
    });
  }

  // Same rule as the AI usage page: a successful call after the error clears it.
  if (src.ai) {
    const health = aiHealth(src.ai.errors, src.ai.calls, now);
    for (const open of [health.blocking, health.quota]) {
      if (!open) continue;
      const kind = open.kind as "billing" | "auth" | "quota";
      out.push({
        key: `ai:${kind}:${open.at}`,
        source: "ai",
        tone: kind === "quota" ? "warning" : "critical",
        title: AI_TITLE[kind],
        summary: AI_BODY[kind],
        body: [
          AI_BODY[kind],
          open.message ? `The provider said: ${open.httpStatus ? `${open.httpStatus} · ` : ""}${open.message}` : null,
          "This clears on its own once a page is made successfully.",
        ].filter((x): x is string => Boolean(x)),
        facts: [{ label: "Last seen", value: fullDateTime(open.at) }],
        at: open.at,
        href: "/admin/vision-costs",
        actionLabel: "Open AI usage",
      });
    }
  }

  if (src.pricing) {
    const observedBy = new Map(src.pricing.observedAiCosts.map((o) => [o.operation, o]));
    for (const item of src.pricing.items) {
      if (!item.billable) continue;
      const observed = item.aiOperation ? (observedBy.get(item.aiOperation) ?? null) : null;
      const p = previewPrice(item, draftFor(item), observed, null);
      if (!p.losing || p.chargedCents == null) continue;
      out.push({
        key: `price:${item.sku}:${p.chargedCents}`,
        source: "pricing",
        tone: "critical",
        title: `${item.name} is priced below cost`,
        summary: `Charging ${money(p.chargedCents)}; a typical high cost is ${usd4FromCents(p.worstCostCents)}.`,
        body: [
          `Customers pay ${money(p.chargedCents)}, but a typical call at the high end (the 90th percentile) costs ${usd4FromCents(p.worstCostCents)}, so each sale loses money.`,
          "Raise the cost basis, markup or minimum price.",
        ],
        facts: [
          { label: "Charging", value: money(p.chargedCents) },
          { label: "High-end cost", value: usd4FromCents(p.worstCostCents) },
        ],
        at: null,
        href: `/admin/pricing?item=${encodeURIComponent(item.sku)}`,
        actionLabel: "Fix the price",
      });
    }
  }

  if (src.finance) {
    const month = monthKey(src.finance.range.to);
    for (const insight of src.finance.insights) {
      if (insight.tone !== "critical" && insight.tone !== "warning") continue;
      out.push({
        key: `finance:${insight.id ?? slug(insight.title)}:${month}`,
        source: "finance",
        tone: insight.tone,
        title: insight.title,
        summary: insight.detail,
        body: [insight.detail],
        facts: [{ label: "Period", value: `${src.finance.range.from} to ${src.finance.range.to}` }],
        at: null,
        href: "/admin/finance",
        actionLabel: "Open financials",
      });
    }
  }

  const rank = { critical: 0, warning: 1 } as const;
  return out.sort((a, b) => rank[a.tone] - rank[b.tone] || (b.at ?? "").localeCompare(a.at ?? ""));
}
