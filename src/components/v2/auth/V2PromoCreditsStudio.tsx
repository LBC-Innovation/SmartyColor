"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Gift, Loader2 } from "lucide-react";
import { V2StudioFrame } from "@/components/v2/V2Chrome";
import {
  ADMIN_CONTENT_CLASS,
  V2AdminToolbar,
} from "@/components/v2/auth/V2AdminSubNav";
import * as api from "@/lib/api/client";
import { formatCredits, parseDollarsToCents } from "@/lib/credits/money";
import { MAX_WELCOME_CREDIT_CENTS, type PromoCreditSettings } from "@/lib/credits/types";

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function V2PromoCreditsStudio() {
  const [settings, setSettings] = useState<PromoCreditSettings | null>(null);
  const [amount, setAmount] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api.adminGetPromoCredits().then((result) => {
      if (cancelled) return;
      if (api.isError(result)) {
        setLoadError(result.error.message);
        return;
      }
      setSettings(result.data);
      setAmount(centsToInput(result.data.welcomeCreditCents));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const cents = parseDollarsToCents(amount);
  const valid = cents !== null && cents >= 0 && cents <= MAX_WELCOME_CREDIT_CENTS;
  const dirty = settings !== null && cents !== settings.welcomeCreditCents;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setSaveError(null);
    const result = await api.adminUpdatePromoCredits({ welcomeCreditDollars: amount.trim() });
    setSaving(false);
    if (api.isError(result)) {
      setSaveError(result.error.message);
      return;
    }
    setSettings(result.data);
    setAmount(centsToInput(result.data.welcomeCreditCents));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <V2StudioFrame>
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
        <V2AdminToolbar />
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-6">
          <div className={`${ADMIN_CONTENT_CLASS} py-6 sm:py-8`}>
            <header className="mb-6">
              <h1 className="v2-brand-title text-2xl tracking-tight text-v2-ink sm:text-3xl">
                Promo credits
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-v2-muted sm:text-base">
                Credit that Colorful Memories gifts to accounts automatically.
              </p>
            </header>

            {loadError ? (
              <p className="v2-panel p-4 text-sm text-red-700" role="alert">
                {loadError}
              </p>
            ) : !settings ? (
              <div className="flex min-h-[20vh] items-center justify-center text-v2-muted">
                <Loader2 className="h-8 w-8 animate-spin text-v2-primary" aria-label="Loading" />
              </div>
            ) : (
              <section>
                <p className="v2-section-title mb-3">Welcome credit</p>
                <form onSubmit={save} className="v2-panel max-w-xl space-y-4 p-4">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-semibold text-v2-ink">
                      <Gift className="h-4 w-4 text-v2-success-text" aria-hidden />
                      “Welcome To Colorful Memories” starter credit
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-v2-muted">
                      Added to every new account&apos;s wallet once, when its email address is
                      confirmed. A new amount applies to accounts confirmed from now on; set it to
                      $0.00 to stop gifting.
                    </p>
                  </div>

                  <div>
                    <label className="v2-label" htmlFor="welcome-credit">
                      Amount (USD)
                    </label>
                    <input
                      id="welcome-credit"
                      type="text"
                      inputMode="decimal"
                      className="v2-input max-w-[12rem]"
                      placeholder="5.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      aria-invalid={!valid}
                      required
                    />
                    {!valid ? (
                      <p className="mt-1 text-xs text-red-700">
                        Enter an amount between $0.00 and{" "}
                        {formatCredits(MAX_WELCOME_CREDIT_CENTS)}.
                      </p>
                    ) : null}
                  </div>

                  {saveError ? (
                    <p className="text-sm text-red-700" role="alert">
                      {saveError}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
                    <p className="text-xs text-v2-muted">
                      Currently {formatCredits(settings.welcomeCreditCents)} · last changed{" "}
                      {new Date(settings.updatedAt).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                    <button
                      type="submit"
                      disabled={!valid || !dirty || saving}
                      className="v2-btn-sm v2-btn-sm-primary"
                    >
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                      {saved ? "Saved" : "Save"}
                    </button>
                  </div>
                </form>
              </section>
            )}
          </div>
        </main>
      </div>
    </V2StudioFrame>
  );
}
