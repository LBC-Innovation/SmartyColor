import type { FulfillmentStep } from "@/lib/orders/types";
import { cn } from "@/lib/cn";
import { Check, Circle, Loader2 } from "lucide-react";

function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function V2OrderTimeline({ steps }: { steps: FulfillmentStep[] }) {
  return (
    <ol className="space-y-0">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        return (
          <li key={step.id} className="relative flex gap-4 pb-8 last:pb-0">
            {!isLast ? (
              <span
                className="absolute left-[15px] top-8 h-[calc(100%-1rem)] w-0.5 bg-gray-200"
                aria-hidden
              />
            ) : null}
            <span
              className={cn(
                "relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2",
                step.state === "complete" && "border-emerald-500 bg-emerald-500 text-white",
                step.state === "current" && "border-v2-primary bg-v2-primary-light text-v2-primary",
                step.state === "upcoming" && "border-gray-200 bg-white text-gray-300",
              )}
            >
              {step.state === "complete" ? (
                <Check className="h-4 w-4" aria-hidden />
              ) : step.state === "current" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Circle className="h-3 w-3" aria-hidden />
              )}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-sm font-semibold text-v2-ink">{step.label}</p>
              <p className="mt-0.5 text-sm text-v2-muted">{step.description}</p>
              {step.occurredAt ? (
                <p className="mt-1 text-xs text-v2-muted">{formatWhen(step.occurredAt)}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
