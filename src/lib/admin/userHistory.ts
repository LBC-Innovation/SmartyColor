/** One account's history for the admin customer drawer, oldest first, built from several sources. */

import { formatCredits } from "@/lib/credits/money";

export type HistoryTone = "good" | "bad" | "warn" | "neutral";

/** Where an event came from, so an admin knows how far to trust it. */
export type HistorySource = "account" | "app" | "stripe";

export type HistoryEvent = {
  id: string;
  at: string;
  /** Stable kind used for grouping and icons, e.g. "sheet_generated", "checkout_declined". */
  type: string;
  description: string;
  /** Wallet change in cents, when the event moved money in or out of the wallet. */
  amountCents: number | null;
  balanceAfterCents: number | null;
  tone: HistoryTone;
  source: HistorySource;
};

export type UserHistory = {
  events: HistoryEvent[];
  /** Whether failed and abandoned card checkouts could be read from Stripe. */
  stripe: "ok" | "not_configured" | "error";
  /** The in-app activity log had more rows than were loaded. */
  truncated: boolean;
};

/** A run of the same kind of event close together, shown as one line. */
export type HistoryRow = {
  id: string;
  start: string;
  end: string;
  type: string;
  count: number;
  description: string;
  amountCents: number | null;
  balanceAfterCents: number | null;
  tone: HistoryTone;
  source: HistorySource;
  events: HistoryEvent[];
};

/** Events that happen in bursts and read better as "Made 20 pages" than twenty lines. */
const GROUPED: Record<string, (n: number) => string> = {
  photo_uploaded: (n) => `Uploaded ${n} photos`,
  photo_deleted: (n) => `Deleted ${n} photos`,
  photo_portrait: (n) => `Made ${n} portrait versions`,
  sheet_generated: (n) => `Made ${n} coloring pages`,
  sheet_edited: (n) => `Edited coloring pages ${n} times`,
  album_created: (n) => `Created ${n} albums`,
  album_deleted: (n) => `Deleted ${n} albums`,
  ai_error: (n) => `Hit ${n} errors making pages`,
  page_view: (n) => `Moved through ${n} screens`,
};

/** Events further apart than this start a new line. */
const GROUP_GAP_MS = 20 * 60_000;

export function groupHistory(events: HistoryEvent[]): HistoryRow[] {
  const rows: HistoryRow[] = [];
  for (const e of events) {
    const last = rows[rows.length - 1];
    const lastEvent = last?.events[last.events.length - 1];
    if (
      last &&
      lastEvent &&
      last.type === e.type &&
      GROUPED[e.type] &&
      new Date(e.at).getTime() - new Date(lastEvent.at).getTime() <= GROUP_GAP_MS
    ) {
      last.events.push(e);
      last.count += 1;
      last.end = e.at;
      if (e.amountCents != null) last.amountCents = (last.amountCents ?? 0) + e.amountCents;
      if (e.balanceAfterCents != null) last.balanceAfterCents = e.balanceAfterCents;
      continue;
    }
    rows.push({
      id: e.id,
      start: e.at,
      end: e.at,
      type: e.type,
      count: 1,
      description: e.description,
      amountCents: e.amountCents,
      balanceAfterCents: e.balanceAfterCents,
      tone: e.tone,
      source: e.source,
      events: [e],
    });
  }
  for (const row of rows) {
    if (row.count > 1) row.description = GROUPED[row.type](row.count);
    // Running out is usually the moment that explains what they did next.
    if (row.amountCents != null && row.amountCents < 0 && row.balanceAfterCents === 0) {
      row.description += ", and the wallet hit $0";
    }
  }
  return rows;
}

export function historyMoney(cents: number): string {
  return formatCredits(Math.abs(Math.round(cents)));
}
