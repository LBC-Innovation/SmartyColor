"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Package,
  Palette,
  ReceiptText,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { V2StudioFrame } from "@/components/v2/V2Chrome";
import { useV2Toast } from "@/components/v2/V2Toast";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/lib/api/client";
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_CATEGORY_LABELS,
  ACTIVITY_TYPES,
  activityCategoryOfType,
  activityTypeLabel,
  type ActivityCategory,
  type ActivityEntry,
} from "@/lib/activity/types";
import { formatCredits } from "@/lib/credits/money";
import { cn } from "@/lib/cn";

const CATEGORY_ICONS: Record<ActivityCategory, LucideIcon> = {
  photos: ImageIcon,
  sheets: Palette,
  albums: FolderOpen,
  orders: Package,
  wallet: Wallet,
};

type Loaded = {
  /** Filters this result belongs to; a mismatch means a newer load is in flight. */
  key: string;
  items: ActivityEntry[];
  hasMore: boolean;
  error: string | null;
};

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function Amount({ entry, className }: { entry: ActivityEntry; className?: string }) {
  if (entry.amountCents == null) {
    return <span className={cn("text-v2-muted", className)}>—</span>;
  }
  const credit = entry.amountCents >= 0;
  return (
    <span
      className={cn(
        "font-bold tabular-nums",
        credit ? "text-v2-success-text" : "text-v2-ink",
        className,
      )}
    >
      {credit ? "+" : "−"}
      {formatCredits(Math.abs(entry.amountCents))}
    </span>
  );
}

function CategoryIcon({ category }: { category: ActivityCategory }) {
  const Icon = CATEGORY_ICONS[category] ?? ReceiptText;
  return (
    <span
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
        category === "wallet" ? "bg-v2-success-bg text-v2-success-text" : "bg-v2-bg-subtle text-v2-navy",
      )}
      aria-hidden
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition",
        active
          ? "border-v2-primary bg-v2-primary-light text-v2-link"
          : "border-gray-200 bg-white text-v2-navy hover:bg-v2-bg-subtle hover:text-v2-ink",
      )}
    >
      {children}
    </button>
  );
}

/** Everything the signed-in user has done, newest first, with filters. */
export function V2ActivityStudio() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const toast = useV2Toast();

  const [category, setCategory] = useState<ActivityCategory | "all">("all");
  const [type, setType] = useState("");
  const [moneyOnly, setMoneyOnly] = useState(false);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [receiptFor, setReceiptFor] = useState<string | null>(null);
  /** Bump to re-fetch after a failed load. */
  const [version, setVersion] = useState(0);
  const userId = user?.id ?? null;

  const filtered = category !== "all" || type !== "" || moneyOnly;
  const key = `${userId}|${category}|${type}|${moneyOnly}|${version}`;

  useEffect(() => {
    if (!authLoading && !user) router.replace("/sign-in?next=/activity");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    api
      .listMyActivity({
        category: category === "all" ? undefined : category,
        type: type || undefined,
        moneyOnly,
      })
      .then((result) => {
        if (cancelled) return;
        if (api.isError(result)) {
          setLoaded({ key, items: [], hasMore: false, error: result.error.message });
          return;
        }
        setLoaded({ key, items: result.data.items, hasMore: result.data.hasMore, error: null });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, category, type, moneyOnly, key]);

  const current = loaded?.key === key ? loaded : null;
  const items = current?.items ?? [];

  function pickCategory(next: ActivityCategory | "all") {
    setCategory(next);
    if (next !== "all" && type && activityCategoryOfType(type) !== next) setType("");
  }

  function clearFilters() {
    setCategory("all");
    setType("");
    setMoneyOnly(false);
  }

  async function loadMore() {
    if (!current || loadingMore) return;
    setLoadingMore(true);
    const result = await api.listMyActivity({
      category: category === "all" ? undefined : category,
      type: type || undefined,
      moneyOnly,
      offset: current.items.length,
    });
    setLoadingMore(false);
    if (api.isError(result)) {
      toast.error(result.error.message, "Couldn’t load more");
      return;
    }
    setLoaded((prev) => {
      if (!prev || prev.key !== key) return prev;
      // New activity since the first page shifts the offset; drop repeats.
      const seen = new Set(prev.items.map((e) => e.id));
      return {
        ...prev,
        items: [...prev.items, ...result.data.items.filter((e) => !seen.has(e.id))],
        hasMore: result.data.hasMore,
      };
    });
  }

  async function openReceipt(entry: ActivityEntry) {
    if (receiptFor) return;
    // Open the tab while we still have the click, or the browser blocks it.
    const tab = window.open("", "_blank");
    setReceiptFor(entry.id);
    const result = await api.fetchActivityReceiptUrl(entry.id);
    setReceiptFor(null);
    if (api.isError(result)) {
      tab?.close();
      toast.error(result.error.message, "Receipt unavailable");
      return;
    }
    if (tab) {
      tab.opener = null;
      tab.location.href = result.data.url;
    } else {
      window.location.assign(result.data.url);
    }
  }

  if (authLoading || !user) {
    return (
      <V2StudioFrame>
        <div className="flex flex-1 items-center justify-center text-v2-muted">
          <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" />
        </div>
      </V2StudioFrame>
    );
  }

  const typeGroups = category === "all" ? ACTIVITY_CATEGORIES : [category];

  function receiptButton(entry: ActivityEntry) {
    if (!entry.hasReceipt) return null;
    const busy = receiptFor === entry.id;
    return (
      <button
        type="button"
        className="v2-btn-sm v2-btn-sm-primary whitespace-nowrap"
        disabled={busy}
        onClick={() => void openReceipt(entry)}
        aria-label={`Get Stripe receipt for ${entry.description}, ${formatWhen(entry.occurredAt)}`}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <ReceiptText className="h-3.5 w-3.5" aria-hidden />
        )}
        Receipt
      </button>
    );
  }

  function orderLink(entry: ActivityEntry) {
    if (!entry.orderId) return null;
    return (
      <Link href={`/orders/${entry.orderId}`} className="font-semibold text-v2-link hover:underline">
        View order
      </Link>
    );
  }

  return (
    <V2StudioFrame>
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-8">
        <div className="mx-auto w-full max-w-5xl px-5 py-6 sm:px-8 sm:py-8">
          <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="v2-brand-title text-2xl tracking-tight text-v2-ink sm:text-3xl">
                Transaction history
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-v2-muted sm:text-base">
                Everything on your account: photos, coloring sheets, albums, book orders and
                wallet activity.
              </p>
            </div>
            <Link
              href="/account"
              className="inline-flex items-center gap-2 rounded-full border border-v2-success-border bg-v2-success-bg px-3.5 py-2 text-sm font-semibold text-v2-success-text transition hover:border-emerald-400"
            >
              <Wallet className="h-4 w-4" aria-hidden />
              <span className="tabular-nums">{formatCredits(user.creditsBalanceCents)}</span>
              <span className="font-medium">balance</span>
            </Link>
          </header>

          {/* ---- filters */}
          <section className="mb-4 space-y-3" aria-label="Filters">
            <div
              role="group"
              aria-label="Category"
              className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
            >
              <FilterPill active={category === "all"} onClick={() => pickCategory("all")}>
                All
              </FilterPill>
              {ACTIVITY_CATEGORIES.map((id) => {
                const Icon = CATEGORY_ICONS[id];
                return (
                  <FilterPill key={id} active={category === id} onClick={() => pickCategory(id)}>
                    <Icon className="h-4 w-4" aria-hidden />
                    {ACTIVITY_CATEGORY_LABELS[id]}
                  </FilterPill>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <label className="flex w-full items-center gap-2 text-sm font-semibold text-v2-navy sm:w-auto">
                <span className="shrink-0">Type</span>
                <select
                  className="v2-input min-w-0 flex-1 py-2 sm:w-56 sm:flex-none"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  <option value="">All types</option>
                  {typeGroups.map((group) =>
                    category === "all" ? (
                      <optgroup key={group} label={ACTIVITY_CATEGORY_LABELS[group]}>
                        {ACTIVITY_TYPES[group].map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </optgroup>
                    ) : (
                      ACTIVITY_TYPES[group].map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))
                    ),
                  )}
                </select>
              </label>
              <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm font-semibold text-v2-navy">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-v2-primary"
                  checked={moneyOnly}
                  onChange={(e) => setMoneyOnly(e.target.checked)}
                />
                Balance changes only
              </label>
              {filtered ? (
                <button
                  type="button"
                  className="min-h-9 text-sm font-semibold text-v2-link hover:underline"
                  onClick={clearFilters}
                >
                  Clear filters
                </button>
              ) : null}
            </div>
          </section>

          {/* ---- results */}
          {!current ? (
            <p className="flex items-center gap-2 py-6 text-sm text-v2-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading history…
            </p>
          ) : current.error ? (
            <div className="v2-panel border-red-200 bg-red-50/80 p-4 text-sm text-red-800" role="alert">
              <p>{current.error}</p>
              <button
                type="button"
                className="mt-2 font-semibold underline"
                onClick={() => setVersion((v) => v + 1)}
              >
                Try again
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="v2-panel flex flex-col items-center gap-3 p-8 text-center">
              <ReceiptText className="h-10 w-10 text-v2-muted" aria-hidden />
              <p className="text-sm font-semibold text-v2-ink">
                {filtered ? "Nothing matches these filters" : "No activity yet"}
              </p>
              <p className="max-w-sm text-sm text-v2-muted">
                {filtered
                  ? "Try a different category or type."
                  : "Upload a photo or add credit and it will show up here."}
              </p>
              {filtered ? (
                <button type="button" className="v2-btn-outline mt-1 text-sm" onClick={clearFilters}>
                  Clear filters
                </button>
              ) : null}
            </div>
          ) : (
            <>
              {/* Desktop and tablet: table */}
              <div className="v2-panel hidden overflow-hidden md:block">
                <table className="w-full table-fixed text-left text-sm">
                  <thead className="border-b border-gray-200 bg-v2-bg-subtle text-xs font-semibold uppercase tracking-wider text-v2-muted">
                    <tr>
                      <th scope="col" className="w-44 px-4 py-3">
                        Date &amp; time
                      </th>
                      <th scope="col" className="w-40 px-4 py-3">
                        Category
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Description
                      </th>
                      <th scope="col" className="w-28 px-4 py-3 text-right">
                        Amount
                      </th>
                      <th scope="col" className="w-28 px-4 py-3 text-right">
                        Balance
                      </th>
                      <th scope="col" className="w-28 px-4 py-3">
                        <span className="sr-only">Receipt</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {items.map((entry) => (
                      <tr key={entry.id} className="align-top">
                        <td className="px-4 py-3 text-v2-navy">{formatWhen(entry.occurredAt)}</td>
                        <td className="px-4 py-3">
                          <span className="block font-semibold text-v2-ink">
                            {ACTIVITY_CATEGORY_LABELS[entry.category] ?? entry.category}
                          </span>
                          <span className="block text-xs text-v2-muted">{activityTypeLabel(entry.type)}</span>
                        </td>
                        <td className="break-words px-4 py-3 text-v2-ink">
                          {entry.description}
                          {entry.orderId ? <span className="mt-0.5 block text-xs">{orderLink(entry)}</span> : null}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Amount entry={entry} />
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-v2-navy">
                          {entry.balanceAfterCents == null ? (
                            <span className="text-v2-muted">—</span>
                          ) : (
                            formatCredits(entry.balanceAfterCents)
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">{receiptButton(entry)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Phones: one card per entry */}
              <ul className="v2-panel divide-y divide-gray-100 md:hidden">
                {items.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-3 p-4">
                    <CategoryIcon category={entry.category} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 break-words text-sm font-semibold text-v2-ink">
                          {entry.description}
                        </p>
                        {entry.amountCents != null ? (
                          <span className="shrink-0 text-right">
                            <Amount entry={entry} className="block text-sm" />
                            {entry.balanceAfterCents != null ? (
                              <span className="block text-xs tabular-nums text-v2-muted">
                                {formatCredits(entry.balanceAfterCents)}
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-v2-muted">
                        {formatWhen(entry.occurredAt)} · {activityTypeLabel(entry.type)}
                      </p>
                      {entry.hasReceipt || entry.orderId ? (
                        <div className="mt-2.5 flex items-center gap-3 text-sm">
                          {receiptButton(entry)}
                          {orderLink(entry)}
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex flex-col items-center gap-2 text-sm text-v2-muted">
                {current.hasMore ? (
                  <button
                    type="button"
                    className="v2-btn-outline text-sm"
                    disabled={loadingMore}
                    onClick={() => void loadMore()}
                  >
                    {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                    Load more
                  </button>
                ) : (
                  <p>
                    {items.length} {items.length === 1 ? "entry" : "entries"}
                    {filtered ? " match these filters" : " — that’s everything"}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </V2StudioFrame>
  );
}
