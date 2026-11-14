"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Time left until `deadline`, ticking once a second. `expired` turns true when it runs out;
 * with no deadline there is no clock and nothing expires.
 */
export function useCancelCountdown(deadline: string | null | undefined): {
  remainingMs: number | null;
  expired: boolean;
} {
  const target = deadline ? Date.parse(deadline) : NaN;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (Number.isNaN(target) || target <= Date.now()) return;
    const timer = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= target) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [target]);

  if (Number.isNaN(target)) return { remainingMs: null, expired: false };
  const remainingMs = Math.max(0, target - now);
  return { remainingMs, expired: remainingMs === 0 };
}

/** "59:07", or "1:02:07" past an hour. */
export function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/** The deadline as a local time, e.g. "Fri 3:42 PM". */
export function formatCancelDeadline(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

/**
 * "Cancel order" with the time left for a full refund. Disables itself once the window closes;
 * the server still checks with the printer before canceling anything.
 */
export function CancelOrderButton({
  deadline,
  onClick,
  className,
  variant = "button",
}: {
  deadline: string | null | undefined;
  onClick: () => void;
  className?: string;
  /** `link` renders as inline text, for use inside a sentence. */
  variant?: "button" | "link";
}) {
  const { remainingMs, expired } = useCancelCountdown(deadline);
  const timeLeft = remainingMs != null && !expired ? formatCountdown(remainingMs) : null;
  const label = expired ? "Cancel window closed" : "Cancel order";
  const ariaLabel = expired
    ? "Cancel window closed"
    : timeLeft
      ? `Cancel order, ${timeLeft} left for a full refund`
      : "Cancel order";

  if (variant === "link") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={expired}
        aria-label={ariaLabel}
        className={cn(
          "font-semibold text-rose-700 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-v2-muted disabled:no-underline",
          className,
        )}
      >
        {label}
        {timeLeft ? <span className="tabular-nums"> ({timeLeft} left)</span> : null}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={expired}
      aria-label={ariaLabel}
      title={expired ? "This order has gone into production and can no longer be canceled." : undefined}
      className={cn(
        "v2-btn-outline gap-2 text-sm text-rose-700 disabled:cursor-not-allowed disabled:text-v2-muted disabled:opacity-60",
        className,
      )}
    >
      {timeLeft ? <Timer className="h-4 w-4 shrink-0" aria-hidden /> : null}
      <span>{label}</span>
      {timeLeft ? (
        <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-rose-700">
          {timeLeft}
        </span>
      ) : null}
    </button>
  );
}
