"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

type State = "working" | "unsubscribed" | "subscribed" | "error";

/** Unsubscribes as soon as the page opens, with a way to undo it. */
export function V2Unsubscribe({ token }: { token: string }) {
  const [state, setState] = useState<State>("working");
  const started = useRef(false);

  const update = useCallback(
    async (subscribe: boolean) => {
      setState("working");
      try {
        const res = await fetch(`/api/email/unsubscribe?t=${encodeURIComponent(token)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscribe }),
        });
        setState(res.ok ? (subscribe ? "subscribed" : "unsubscribed") : "error");
      } catch {
        setState("error");
      }
    },
    [token],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void update(false);
  }, [update]);

  if (state === "working") {
    return (
      <div className="flex items-center gap-3 text-v2-muted">
        <Loader2 className="h-5 w-5 animate-spin text-v2-primary" aria-hidden />
        Updating your email settings
      </div>
    );
  }
  if (state === "error") {
    return (
      <>
        <h1 className="v2-brand-title text-3xl tracking-tight">Something went wrong</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-v2-navy">We could not update your email settings.</p>
        <button type="button" className="v2-btn-primary mt-6" onClick={() => void update(false)}>
          Try again
        </button>
      </>
    );
  }
  if (state === "subscribed") {
    return (
      <>
        <h1 className="v2-brand-title text-3xl tracking-tight">You are subscribed again</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-v2-navy">We will send you tips and reminders about your books.</p>
      </>
    );
  }
  return (
    <>
      <h1 className="v2-brand-title text-3xl tracking-tight">You are unsubscribed</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-v2-navy">
        We will stop sending you tips and reminders. You will still get emails about orders you place.
      </p>
      <button type="button" className="v2-btn-primary mt-6" onClick={() => void update(true)}>
        Subscribe again
      </button>
    </>
  );
}
