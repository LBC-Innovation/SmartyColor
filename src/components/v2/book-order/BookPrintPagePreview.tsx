"use client";

import { BookPageImageFill } from "@/components/v2/book-order/BookPageImageFill";
import type { BookBindingSpec } from "@/lib/print/bookBindings";
import type { BookWizardPage } from "@/lib/print/bookWizardTypes";
import { cn } from "@/lib/cn";

type Props = {
  page: BookWizardPage | null;
  pageNumber: number;
  binding: BookBindingSpec;
  side: "left" | "right";
  className?: string;
};

export function BookPrintPagePreview({
  page,
  pageNumber,
  binding,
  side,
  className,
}: Props) {
  return (
    <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", className)}>
      <p className="mb-1 text-center text-[10px] font-semibold tabular-nums text-v2-muted">
        {side === "right" ? "Right" : "Left"} · Page {pageNumber}
      </p>
      <div className="relative flex min-h-0 flex-1 items-center justify-center rounded-lg border border-gray-200 bg-white p-1.5 shadow-sm">
        <div className="relative flex h-full max-h-full w-full max-w-full items-center justify-center overflow-hidden rounded-md bg-v2-bg-subtle aspect-[8.5/11]">
          {!page ? (
            <span className="text-xs text-v2-muted">—</span>
          ) : page.kind === "blank" ? (
            <div className="flex h-full w-full flex-col items-center justify-center border border-dashed border-gray-300 bg-white text-v2-muted">
              <p className="text-xs font-semibold">Blank</p>
            </div>
          ) : (
            <BookPageImageFill page={page} binding={binding} className="rounded-md" />
          )}
        </div>
      </div>
    </div>
  );
}
