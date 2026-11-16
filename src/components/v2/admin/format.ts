import { formatCredits } from "@/lib/credits/money";
import type { BookOrderStatus } from "@/lib/orders/types";
import type { VisionCostOperation } from "@/lib/visionCost/types";

/** Whole-cent money; sub-cent amounts round to $0.00 and never show "-$0.00". */
export function money(cents: number | null | undefined, options?: { compact?: boolean }): string {
  if (cents == null || !Number.isFinite(cents)) return "—";
  const rounded = Math.round(cents);
  return formatCredits(rounded === 0 ? 0 : rounded, options);
}

/** Signed change: "+$12.00" / "−$4.50" / "$0.00". */
export function signedMoney(cents: number): string {
  const rounded = Math.round(cents);
  if (rounded === 0) return money(0);
  return `${rounded > 0 ? "+" : "−"}${money(Math.abs(rounded))}`;
}

/** AI amounts in cents with sub-cent precision, shown as "$0.0412". */
export function usd4FromCents(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "—";
  return `${cents < 0 ? "−" : ""}$${(Math.abs(cents) / 100).toFixed(4)}`;
}

/** AI amounts in dollars, shown as "$0.0412". */
export function usd4(dollars: number | null | undefined): string {
  if (dollars == null || !Number.isFinite(dollars)) return "—";
  return `${dollars < 0 ? "−" : ""}$${Math.abs(dollars).toFixed(4)}`;
}

export function percent(value: number | null | undefined, digits = 1): string {
  return value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(digits)}%`;
}

export function count(n: number | null | undefined): string {
  return n == null ? "—" : new Intl.NumberFormat().format(n);
}

/** "+3" / "−1" / "0". */
export function signedCount(n: number): string {
  return n > 0 ? `+${count(n)}` : n < 0 ? `−${count(Math.abs(n))}` : "0";
}

/** "+12%" vs a previous value; null when there was nothing before. */
export function changePct(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

const DAY = 86_400_000;

/** Full local date-time, for `title` attributes. */
export function fullDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

/** "Just now", "2 h ago", "Today 2:14 PM", "Yesterday", "3 days ago", then "Nov 3". */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 0) return shortDate(iso);
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if (d >= startOfToday) {
    if (diff < 6 * 3_600_000) return `${Math.floor(diff / 3_600_000)} h ago`;
    return `Today ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  }
  if (d.getTime() >= startOfToday.getTime() - DAY) return "Yesterday";
  const days = Math.ceil((startOfToday.getTime() - d.getTime()) / DAY);
  if (days <= 7) return `${days} days ago`;
  return shortDate(iso);
}

export function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

/** Plain owner words for each AI action. */
export const AI_ACTION_LABEL: Record<VisionCostOperation, string> = {
  photoToColoring: "Make a coloring page",
  correctPhotoColoring: "Fix a coloring page",
  photoToPortrait: "Turn a photo portrait",
  generateImage: "Draw a picture",
  refine: "Edit a page",
  storybookPhotoChat: "Story book: describe photo",
  storybookGenerate: "Story book: write story",
};

export function aiActionLabel(operation: string): string {
  return AI_ACTION_LABEL[operation as VisionCostOperation] ?? operation;
}

export type Tone = "neutral" | "info" | "progress" | "good" | "warn" | "bad";

export const ORDER_STATUS_TONE: Record<BookOrderStatus, Tone> = {
  draft: "neutral",
  quoted: "neutral",
  awaiting_payment: "warn",
  paid: "progress",
  submitting_to_lulu: "progress",
  submitted_to_lulu: "progress",
  in_production: "progress",
  shipped: "info",
  delivered: "good",
  failed: "bad",
  canceled: "neutral",
  refunded: "neutral",
};
