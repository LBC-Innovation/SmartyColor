"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Clock, Loader2 } from "lucide-react";
import { BookJourney } from "@/components/v2/book-packages/BookJourney";
import { WizardProgress } from "@/components/v2/book-packages/WizardProgress";
import { BOOK_PACKAGES } from "@/content/marketing";
import { isError } from "@/lib/api/client";
import { confirmPackageCheckout } from "@/lib/bookPackages/client";
import { fillPackageCopy, packageTokens } from "@/lib/bookPackages/copy";
import { trackPackagePurchasedOnce } from "@/lib/bookPackages/track";
import type { BookPackagePurchase } from "@/lib/bookPackages/types";
import { CONTACT_EMAIL } from "@/content/marketing";
import type { BookBindingId } from "@/lib/print/bookBindings";
import { track } from "@/lib/track";
import { trackFormat } from "@/lib/marketing/events";

const POLL_MS = 3000;
const MAX_POLLS = 10;
const AUTO_CONTINUE_MS = 1200;

type State =
  | { kind: "confirming" }
  | { kind: "ready"; purchase: BookPackagePurchase }
  | { kind: "pending"; gaveUp: boolean }
  | { kind: "failed" };

/**
 * Step 2 (working): back from Stripe. Asks the server to confirm the payment, which makes the
 * package once. Safe to confirm again: the answer for a repeat is the same package.
 */
export function PackageReturn({
  sessionId,
  bindingHint,
  onContinue,
  onTryAgain,
  onPickAnother,
  onAlbums,
}: {
  sessionId: string;
  /** The book the person chose, when this browser remembers it (for analytics only). */
  bindingHint: BookBindingId | null;
  onContinue: (purchase: BookPackagePurchase) => void;
  onTryAgain: () => void;
  onPickAnother: () => void;
  onAlbums: () => void;
}) {
  const [state, setState] = useState<State>({ kind: "confirming" });
  // Bumped by "Check again" to run the wait-and-ask loop once more.
  const [round, setRound] = useState(0);
  const continued = useRef(false);

  // Ask the server, and while the bank is still working ask again every few seconds (up to a limit).
  useEffect(() => {
    let alive = true;
    void (async () => {
      for (let attempt = 0; attempt < MAX_POLLS && alive; attempt++) {
        const res = await confirmPackageCheckout(sessionId);
        if (!alive) return;
        if (isError(res)) {
          const code = res.error.code;
          if (code !== "UNAVAILABLE" && code) {
            track("package_payment_failed", {
              format: trackFormat(bindingHint ?? "perfect_bound"),
              reason: code === "EXPIRED" ? "expired" : code === "NOT_PAID" ? "declined" : "unknown",
            });
            setState({ kind: "failed" });
            return;
          }
          // Couldn't reach Stripe or our server: wait like a slow bank.
        } else if (res.data.status === "ready") {
          trackPackagePurchasedOnce(res.data.purchase, "card");
          setState({ kind: "ready", purchase: res.data.purchase });
          return;
        }
        setState({ kind: "pending", gaveUp: false });
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
      }
      if (alive) setState({ kind: "pending", gaveUp: true });
    })();
    return () => {
      alive = false;
    };
  }, [sessionId, bindingHint, round]);

  // Move on by itself unless the person prefers reduced motion.
  useEffect(() => {
    if (state.kind !== "ready") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => {
      if (continued.current) return;
      continued.current = true;
      onContinue(state.purchase);
    }, AUTO_CONTINUE_MS);
    return () => clearTimeout(t);
  }, [state, onContinue]);

  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, [state.kind]);

  function retryNow() {
    setState({ kind: "confirming" });
    setRound((r) => r + 1);
  }

  let icon = <Loader2 className="h-6 w-6 animate-spin" aria-hidden />;
  let tone = "bg-v2-primary-light text-v2-primary";
  let title: string = BOOK_PACKAGES.returnConfirmingTitle;
  let body: string | null = BOOK_PACKAGES.returnConfirmingBody;
  let actions: React.ReactNode = null;

  if (state.kind === "ready") {
    const tokens = packageTokens(state.purchase);
    icon = <Check className="h-6 w-6" strokeWidth={3} aria-hidden />;
    tone = "bg-v2-success-bg text-v2-success-text";
    title = BOOK_PACKAGES.returnPaidTitle;
    body = fillPackageCopy(BOOK_PACKAGES.returnPaidBody, tokens);
    actions = (
      <button
        type="button"
        onClick={() => {
          if (continued.current) return;
          continued.current = true;
          onContinue(state.purchase);
        }}
        className="v2-btn-primary mt-5 min-h-11 w-full"
      >
        {BOOK_PACKAGES.returnContinue}
      </button>
    );
  } else if (state.kind === "pending") {
    icon = <Clock className="h-6 w-6" aria-hidden />;
    title = state.gaveUp ? BOOK_PACKAGES.returnGaveUpTitle : BOOK_PACKAGES.returnPendingTitle;
    body = state.gaveUp
      ? (fillPackageCopy(BOOK_PACKAGES.returnGaveUpBody, { email: CONTACT_EMAIL }) ?? BOOK_PACKAGES.returnGaveUpBodyNoEmail)
      : BOOK_PACKAGES.returnPendingBody;
    actions = (
      <div className="mt-5 flex flex-col gap-2">
        <button type="button" onClick={onAlbums} className="v2-btn-outline min-h-11 w-full">
          {BOOK_PACKAGES.returnAlbums}
        </button>
        {state.gaveUp ? (
          <button type="button" onClick={retryNow} className="v2-btn-primary min-h-11 w-full">
            {BOOK_PACKAGES.returnCheckAgain}
          </button>
        ) : null}
      </div>
    );
  } else if (state.kind === "failed") {
    icon = <AlertCircle className="h-6 w-6" aria-hidden />;
    tone = "bg-amber-50 text-amber-900";
    title = BOOK_PACKAGES.returnFailedTitle;
    body = BOOK_PACKAGES.returnFailedBody;
    actions = (
      <div className="mt-5 flex flex-col gap-1">
        <button type="button" onClick={onTryAgain} className="v2-btn-primary min-h-11 w-full">
          {BOOK_PACKAGES.returnTryAgain}
        </button>
        <button
          type="button"
          onClick={onPickAnother}
          className="inline-flex min-h-11 items-center justify-center px-3 text-sm font-semibold text-v2-link hover:underline"
        >
          {BOOK_PACKAGES.returnPickAnother}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 pb-12 pt-6 sm:px-6">
      <WizardProgress step={2} className="mb-5" />
      <div className="v2-panel p-6 text-center sm:p-8" role="status" aria-live="polite">
        <span className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${tone}`}>{icon}</span>
        <h1 ref={headingRef} tabIndex={-1} className="v2-brand-title mt-4 text-xl text-v2-ink outline-none">
          {title}
        </h1>
        {body ? <p className="mt-2 text-sm text-v2-muted">{body}</p> : null}
        {state.kind === "ready" ? <BookJourney current={2} compact className="mt-5 text-left" /> : null}
        {actions}
      </div>
    </div>
  );
}
