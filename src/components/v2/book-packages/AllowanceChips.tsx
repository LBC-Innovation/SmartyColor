import { Check, Coins } from "lucide-react";
import { cn } from "@/lib/cn";

const CHIP = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold";

/** Paid by the package: nothing more to pay. */
export function IncludedChip({ className, label = "Included" }: { className?: string; label?: string }) {
  return (
    <span className={cn(CHIP, "border border-v2-success-border bg-v2-success-bg text-v2-success-text", className)}>
      <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
      {label}
    </span>
  );
}

/** Paid from the customer's credit, never from the package. `label` carries the price. */
export function ExtraChip({ label, className }: { label: string; className?: string }) {
  return (
    <span className={cn(CHIP, "border border-amber-200 bg-amber-50 text-amber-900", className)}>
      <Coins className="h-3.5 w-3.5" aria-hidden />
      {label}
    </span>
  );
}

/** The amber box used wherever an extra can be confirmed (same look as the edit chat's cost notice). */
export function ExtraNotice({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-sm text-amber-900",
        className,
      )}
    >
      <Coins className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
