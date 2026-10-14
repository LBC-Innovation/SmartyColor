"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, Loader2, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { BOOK_ORDER_STEP_LABEL, type BookOrderStep } from "@/components/v2/book-order/BookOrderStepper";
import * as api from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { BOOK_CARTS_CHANGED_EVENT, type BookCartSummary } from "@/lib/orders/cartTypes";
import { getBookFormat, isPrintBindingId } from "@/lib/print/bookBindings";

function formatName(bindingId: string | null): string | null {
  if (bindingId === "digital" || isPrintBindingId(bindingId)) return getBookFormat(bindingId).shortLabel;
  return null;
}

function stepName(step: string): string {
  return BOOK_ORDER_STEP_LABEL[step as BookOrderStep] ?? "Book";
}

function ago(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

/** Books started in the order wizard and not ordered yet, kept fresh across tabs and saves. */
function useBookCarts(enabled: boolean) {
  const [carts, setCarts] = useState<BookCartSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    const result = await api.listBookCarts();
    if (api.isError(result)) {
      setFailed(true);
      return;
    }
    setFailed(false);
    setCarts(result.data);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const run = () => void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    // Deferred so the first fetch isn't a synchronous effect update.
    const first = window.setTimeout(run, 0);
    window.addEventListener(BOOK_CARTS_CHANGED_EVENT, run);
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(first);
      window.removeEventListener(BOOK_CARTS_CHANGED_EVENT, run);
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, refresh]);

  return { carts: enabled ? carts : null, failed, refresh, setCarts };
}

/** Cart button in the header: the books this account is still putting together. */
export function V2CartMenu() {
  const { user, loading } = useAuth();
  const enabled = Boolean(user) && !loading;
  const { carts, failed, refresh, setCarts } = useBookCarts(enabled);
  const [open, setOpen] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!enabled) return null;
  const count = carts?.length ?? 0;

  async function remove(id: string) {
    setDeletingId(id);
    const result = await api.deleteBookCart(id);
    setDeletingId(null);
    setConfirmingId(null);
    if (api.isError(result)) return;
    setCarts((prev) => prev?.filter((c) => c.id !== id) ?? prev);
    window.dispatchEvent(new Event(BOOK_CARTS_CHANGED_EVENT));
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={cn(
          "v2-hit relative inline-flex h-8 w-8 items-center justify-center rounded-full text-v2-navy transition hover:bg-v2-bg-subtle hover:text-v2-ink sm:h-9 sm:w-9",
          open && "bg-v2-bg-subtle text-v2-ink",
        )}
        aria-label={count > 0 ? `Cart: ${count} book${count === 1 ? "" : "s"} in progress` : "Cart"}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((v) => !v);
          setConfirmingId(null);
          if (!open) void refresh();
        }}
      >
        <ShoppingCart className="h-[18px] w-[18px]" aria-hidden />
        {count > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-v2-primary px-1 text-[10px] font-bold tabular-nums leading-none text-white">
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id={panelId}
          className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_16px_48px_rgb(10_16_26/0.16)]"
          role="dialog"
          aria-label="Books in progress"
        >
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-semibold text-v2-ink">Your cart</p>
            <p className="text-xs text-v2-muted">Books you started and haven&apos;t ordered yet.</p>
          </div>

          <div className="max-h-[min(24rem,60dvh)] overflow-y-auto overscroll-contain">
            {carts === null ? (
              <p className="flex items-center gap-2 px-4 py-6 text-sm text-v2-muted" role="status">
                {failed ? (
                  "We couldn't load your cart."
                ) : (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Loading…
                  </>
                )}
              </p>
            ) : carts.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <ShoppingCart className="mx-auto h-6 w-6 text-v2-muted" aria-hidden />
                <p className="mt-2 text-sm text-v2-muted">No books in progress.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {carts.map((cart) => {
                  const format = formatName(cart.bindingId);
                  const confirming = confirmingId === cart.id;
                  return (
                    <li key={cart.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="flex h-14 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-v2-bg-subtle">
                        {cart.thumbUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={cart.thumbUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <BookOpen className="h-5 w-5 text-v2-muted" aria-hidden />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-v2-ink">{cart.title}</p>
                        <p className="truncate text-xs text-v2-muted">
                          {[format, cart.pageCount > 0 ? `${cart.pageCount} pages` : null]
                            .filter(Boolean)
                            .join(" · ") || "Just started"}
                        </p>
                        <p className="truncate text-[11px] text-v2-muted">
                          At {stepName(cart.step)} · {ago(cart.updatedAt)}
                        </p>
                      </div>
                      {confirming ? (
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <button
                            type="button"
                            className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                            disabled={deletingId === cart.id}
                            onClick={() => void remove(cart.id)}
                          >
                            {deletingId === cart.id ? "Removing…" : "Remove"}
                          </button>
                          <button
                            type="button"
                            className="px-1 text-xs font-semibold text-v2-muted hover:text-v2-ink"
                            onClick={() => setConfirmingId(null)}
                          >
                            Keep
                          </button>
                        </div>
                      ) : (
                        <div className="flex shrink-0 items-center gap-1">
                          <Link
                            href={`/studio/order?cart=${cart.id}`}
                            className="v2-btn-primary h-8 px-3 text-xs"
                            onClick={() => setOpen(false)}
                          >
                            Resume
                          </Link>
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-v2-muted transition hover:bg-red-50 hover:text-red-600"
                            aria-label={`Remove ${cart.title} from cart`}
                            onClick={() => setConfirmingId(cart.id)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-gray-100 p-2">
            <Link
              href="/studio/order"
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold text-v2-link transition hover:bg-v2-bg-subtle"
              onClick={() => setOpen(false)}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Start a new book
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
