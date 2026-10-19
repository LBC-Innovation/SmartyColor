import { Gift } from "lucide-react";
import { HOLIDAY_LINE } from "@/content/marketing";
import { fillCopy } from "@/lib/marketing/copy";

/** Slim "Order by {date} for Christmas delivery." bar. Callers render it only while the date is ahead. */
export function HolidayBanner({ label }: { label: string }) {
  const text = fillCopy(HOLIDAY_LINE, { date: label });
  if (!text) return null;
  return (
    <p className="flex shrink-0 items-center justify-center gap-2 bg-v2-navy px-4 py-1.5 text-center text-xs font-semibold text-white sm:text-sm">
      <Gift className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {text}
    </p>
  );
}
