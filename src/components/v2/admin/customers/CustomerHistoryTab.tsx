"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, History, Loader2 } from "lucide-react";
import type { AdminUser } from "@/lib/api/types";
import * as api from "@/lib/api/client";
import { groupHistory, type HistoryRow, type HistoryTone, type UserHistory } from "@/lib/admin/userHistory";
import { EmptyState, SegmentedControl } from "@/components/v2/admin/ui";
import { fullDateTime, signedMoney } from "@/components/v2/admin/format";
import { cn } from "@/lib/cn";

/** Times read the same for every admin, whatever their own clock says. */
const ZONE = "America/New_York";
const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hour: "numeric", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, weekday: "short", month: "short", day: "numeric", year: "numeric" });

type Filter = "all" | "actions" | "money";
type Order = "newest" | "oldest";

const MONEY_OR_PROBLEM = new Set(["signup", "checkout_declined", "checkout_abandoned", "checkout_uncredited", "ai_error"]);

const TONE_DOT: Record<HistoryTone, string> = {
  good: "bg-emerald-500",
  bad: "bg-red-500",
  warn: "bg-amber-500",
  neutral: "bg-gray-300",
};

function timeRange(row: HistoryRow): string {
  const start = timeFmt.format(new Date(row.start));
  const end = timeFmt.format(new Date(row.end));
  return start === end ? start : `${start}–${end}`;
}

/** Everything this customer did and what happened to their money, in plain sentences. */
export function CustomerHistoryTab({ user }: { user: AdminUser }) {
  const [history, setHistory] = useState<UserHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [order, setOrder] = useState<Order>("newest");

  useEffect(() => {
    let alive = true;
    void api.adminUserHistory(user.id).then((r) => {
      if (!alive) return;
      if (api.isError(r)) setError(r.error.message);
      else setHistory(r.data);
    });
    return () => {
      alive = false;
    };
  }, [user.id]);

  const days = useMemo(() => {
    if (!history) return [];
    const events =
      filter === "money"
        ? history.events.filter((e) => e.amountCents != null || MONEY_OR_PROBLEM.has(e.type))
        : filter === "actions"
          ? history.events.filter((e) => e.type !== "page_view")
          : history.events;
    const rows = groupHistory(events);
    if (order === "newest") rows.reverse();
    const byDay: Array<{ day: string; rows: HistoryRow[] }> = [];
    for (const row of rows) {
      const day = dayFmt.format(new Date(row.start));
      const last = byDay[byDay.length - 1];
      if (last?.day === day) last.rows.push(row);
      else byDay.push({ day, rows: [row] });
    }
    return byDay;
  }, [history, filter, order]);

  if (error) {
    return (
      <p className="text-sm text-red-700" role="alert">
        Couldn&apos;t load history: {error}
      </p>
    );
  }
  if (!history) {
    return (
      <p className="flex items-center gap-2 text-sm text-v2-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading history…
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl<Filter>
          ariaLabel="Which events"
          options={[
            { id: "all", label: "Everything" },
            { id: "actions", label: "Hide screens" },
            { id: "money", label: "Money and problems" },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <SegmentedControl<Order>
          ariaLabel="Order"
          options={[
            { id: "newest", label: "Newest first" },
            { id: "oldest", label: "Oldest first" },
          ]}
          value={order}
          onChange={setOrder}
        />
      </div>

      {history.stripe === "error" ? (
        <p className="text-sm text-amber-800" role="status">
          Stripe couldn&apos;t be reached, so declined and abandoned card checkouts aren&apos;t shown.
        </p>
      ) : history.stripe === "not_configured" ? (
        <p className="text-sm text-v2-muted">Stripe isn&apos;t set up here, so card checkouts aren&apos;t shown.</p>
      ) : null}

      {days.length === 0 ? (
        <div className="rounded-xl border border-gray-200">
          <EmptyState icon={History} title="Nothing here yet." />
        </div>
      ) : (
        <div className="space-y-5">
          {days.map(({ day, rows }) => (
            <section key={day} aria-label={day}>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-v2-muted">{day}</h3>
              <ol className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                {rows.map((row) => (
                  <HistoryLine key={row.id} row={row} />
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      <p className="text-xs text-v2-muted">
        Times are Eastern. Built from the screens they opened while signed in (recorded from Nov 27, 2026), the
        app&apos;s activity log, AI errors, book carts and orders, plus card checkouts read live from Stripe
        {history.truncated ? "; only the latest 2,000 of each are shown" : ""}.
      </p>
    </div>
  );
}

function HistoryLine({ row }: { row: HistoryRow }) {
  const [open, setOpen] = useState(false);
  const expandable = row.count > 1;
  const body = (
    <>
      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", TONE_DOT[row.tone])} aria-hidden />
      <time
        dateTime={row.start}
        title={fullDateTime(row.start)}
        className="w-[4.5rem] shrink-0 text-sm tabular-nums text-v2-muted sm:w-32 sm:whitespace-nowrap"
      >
        {timeRange(row)}
      </time>
      <span className="min-w-0 flex-1 text-sm text-v2-ink">
        {row.description}
        {row.source === "stripe" ? <span className="ml-1.5 text-xs text-v2-muted">(Stripe)</span> : null}
      </span>
      {row.amountCents != null && row.amountCents !== 0 ? (
        <span
          className={cn(
            "shrink-0 text-sm font-semibold tabular-nums",
            row.amountCents > 0 ? "text-emerald-700" : "text-v2-muted",
          )}
        >
          {signedMoney(row.amountCents)}
        </span>
      ) : null}
      {expandable ? (
        <ChevronRight className={cn("mt-0.5 h-4 w-4 shrink-0 text-v2-muted transition-transform", open && "rotate-90")} aria-hidden />
      ) : null}
    </>
  );

  return (
    <li>
      {expandable ? (
        <button
          type="button"
          className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-v2-bg-subtle"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {body}
        </button>
      ) : (
        <div className="flex items-start gap-3 px-3 py-2.5">{body}</div>
      )}
      {open ? (
        <ul className="space-y-1 border-t border-gray-100 bg-v2-bg-subtle/50 px-3 py-2 pl-[7.25rem] sm:pl-[10.75rem] text-xs text-v2-muted">
          {row.events.map((e) => (
            <li key={e.id} className="flex gap-3">
              <time dateTime={e.at} className="hidden w-16 shrink-0 tabular-nums sm:block">
                {timeFmt.format(new Date(e.at))}
              </time>
              <span className="min-w-0 flex-1">{e.description}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
