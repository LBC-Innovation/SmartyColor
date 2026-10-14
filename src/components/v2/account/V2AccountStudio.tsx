"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, KeyRound, Loader2, UserPen } from "lucide-react";
import { V2StudioFrame } from "@/components/v2/V2Chrome";
import { V2SavedAddressPanel } from "@/components/v2/account/V2SavedAddressPanel";
import { V2AddCreditForm } from "@/components/v2/credits/V2AddCreditForm";
import { useCreditCheckoutReturn } from "@/components/v2/credits/useCreditCheckoutReturn";
import { ChangePasswordModal, EditProfileModal } from "@/components/v2/auth/V2UserMenu";
import { V2UserAvatar } from "@/components/v2/ui/V2UserAvatar";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/lib/api/client";
import { formatCredits } from "@/lib/credits/money";
import type { CreditLedgerEntry } from "@/lib/credits/types";
import { cn } from "@/lib/cn";

const CONTENT = "mx-auto w-full max-w-4xl px-5 py-6 sm:px-8 sm:py-8";

/** Human label for a ledger reason code. */
function describeReason(reason: string, note: string | null): string {
  const key = reason.toLowerCase();
  if (key.includes("topup") || key.includes("top_up") || key.includes("stripe") || key.includes("purchase")) return "Added credit";
  if (key.includes("order")) return "Book order";
  if (key.includes("refund")) return "Refund";
  if (key.includes("signup") || key.includes("welcome") || key.includes("bonus")) return "Welcome credit";
  if (key.includes("admin") || key.includes("grant") || key.includes("promo")) return "Promo credit";
  const humanized = reason.replace(/[_-]+/g, " ").trim();
  return note?.trim() || (humanized ? humanized[0].toUpperCase() + humanized.slice(1) : "Adjustment");
}

export function V2AccountStudio() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [ledger, setLedger] = useState<CreditLedgerEntry[] | null>(null);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [modal, setModal] = useState<"profile" | "password" | null>(null);
  /** Bump to re-fetch the ledger (e.g. after a top-up). */
  const [ledgerVersion, setLedgerVersion] = useState(0);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!authLoading && !user) router.replace("/sign-in?next=/account");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    api.listMyCreditLedger().then((result) => {
      if (cancelled) return;
      if (api.isError(result)) {
        setLedgerError(result.error.message);
        return;
      }
      setLedgerError(null);
      setLedger(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, ledgerVersion]);

  useCreditCheckoutReturn({ onBalanceChanged: () => setLedgerVersion((v) => v + 1) });

  if (authLoading || !user) {
    return (
      <V2StudioFrame>
        <div className="flex flex-1 items-center justify-center text-v2-muted">
          <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" />
        </div>
      </V2StudioFrame>
    );
  }

  const name = user.displayName || user.email.split("@")[0];
  const joined = new Date(user.createdAt);

  return (
    <V2StudioFrame>
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-8">
        <div className={CONTENT}>
          <header className="mb-6">
            <h1 className="v2-brand-title text-2xl tracking-tight text-v2-ink sm:text-3xl">Account</h1>
          </header>

          <div className="grid gap-4 lg:grid-cols-[1fr_22rem] lg:items-start">
            {/* ---- balance + add credit */}
            <section className="v2-panel p-5 sm:p-6 lg:order-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-v2-muted">Credit balance</p>
              <p className="mt-1 text-4xl font-bold tabular-nums text-v2-success-text">
                {formatCredits(user.creditsBalanceCents)}
              </p>
              <p className="mt-1 text-xs text-v2-muted">Applied toward printed books at checkout.</p>
              <div className="mt-5">
                <V2AddCreditForm returnPath="/account" compact />
              </div>
            </section>

            <div className="space-y-4 lg:order-1">
              {/* ---- account details */}
              <section className="v2-panel p-5 sm:p-6">
                <div className="flex items-start gap-4">
                  <V2UserAvatar name={name} src={user.avatarUrl} size={56} shape="circle" />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-lg font-semibold text-v2-ink">{name}</h2>
                    <p className="truncate text-sm text-v2-muted">{user.email}</p>
                  </div>
                </div>
                <dl className="mt-5 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wider text-v2-muted">Member since</dt>
                    <dd className="mt-0.5 text-v2-ink">
                      {Number.isNaN(joined.getTime())
                        ? "—"
                        : joined.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wider text-v2-muted">Plan</dt>
                    <dd className="mt-0.5 capitalize text-v2-ink">{user.planTier || "Free"}</dd>
                  </div>
                </dl>
                <div className="mt-5 flex flex-wrap gap-2">
                  <button type="button" className="v2-btn-outline text-sm" onClick={() => setModal("profile")}>
                    <UserPen className="h-4 w-4" aria-hidden />
                    Edit profile
                  </button>
                  <button type="button" className="v2-btn-outline text-sm" onClick={() => setModal("password")}>
                    <KeyRound className="h-4 w-4" aria-hidden />
                    Change password
                  </button>
                </div>
              </section>

              {/* ---- saved address */}
              <V2SavedAddressPanel userId={user.id} />

              {/* ---- transactions */}
              <section className="v2-panel p-5 sm:p-6">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-lg font-semibold text-v2-ink">Transactions</h2>
                  <Link href="/activity" className="text-sm font-semibold text-v2-link hover:underline">
                    Full history
                  </Link>
                </div>
                {ledgerError ? (
                  <p className="mt-3 text-sm text-red-700" role="alert">
                    {ledgerError}
                  </p>
                ) : ledger == null ? (
                  <p className="mt-3 flex items-center gap-2 text-sm text-v2-muted">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Loading…
                  </p>
                ) : ledger.length === 0 ? (
                  <p className="mt-3 text-sm text-v2-muted">No transactions yet. Add credit to get started.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-gray-100">
                    {ledger.map((entry) => {
                      const credit = entry.delta >= 0;
                      return (
                        <li key={entry.id} className="flex items-center gap-3 py-3">
                          <span
                            className={cn(
                              "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                              credit ? "bg-v2-success-bg text-v2-success-text" : "bg-v2-bg-subtle text-v2-navy",
                            )}
                            aria-hidden
                          >
                            {credit ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-v2-ink">
                              {describeReason(entry.reason, entry.note)}
                            </span>
                            <span className="block text-xs text-v2-muted">
                              {new Date(entry.createdAt).toLocaleString(undefined, {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })}
                              {entry.note && describeReason(entry.reason, null) !== entry.note ? ` · ${entry.note}` : ""}
                            </span>
                          </span>
                          <span className="text-right">
                            <span
                              className={cn(
                                "block text-sm font-bold tabular-nums",
                                credit ? "text-v2-success-text" : "text-v2-ink",
                              )}
                            >
                              {credit ? "+" : "−"}
                              {formatCredits(Math.abs(entry.delta))}
                            </span>
                            <span className="block text-xs text-v2-muted tabular-nums">
                              {formatCredits(entry.balanceAfter)}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </div>
      </main>

      {modal === "profile" ? <EditProfileModal onClose={() => setModal(null)} /> : null}
      {modal === "password" ? <ChangePasswordModal onClose={() => setModal(null)} /> : null}
    </V2StudioFrame>
  );
}
