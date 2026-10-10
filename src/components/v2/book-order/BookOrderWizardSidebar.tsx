"use client";

import { BookOrderCalculatorCard } from "@/components/v2/book-order/BookOrderCalculatorCard";
import type { BookBindingSpec } from "@/lib/print/bookBindings";
import type { BookPagePlan } from "@/lib/print/bookWizardTypes";

type Props = {
  plan: BookPagePlan;
  binding: BookBindingSpec;
  estimatedTotalCents: number | null;
  printCents: number | null;
  shippingCents: number | null;
  shippingZip: string;
  onShippingZipChange: (zip: string) => void;
  quoteLoading: boolean;
  quoteError?: string | null;
  quoteEnabled: boolean;
};

export function BookOrderWizardSidebar(props: Props) {
  return (
    <aside
      className="hidden h-full min-h-0 w-72 shrink-0 flex-col border-r border-gray-200 bg-v2-bg-subtle lg:flex xl:w-[22rem]"
      aria-label="Book specifications and pricing"
    >
      <div className="v2-gutter-pl flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain py-3 pr-3">
        <BookOrderCalculatorCard {...props} layout="sidebar" />
      </div>
    </aside>
  );
}

export function BookOrderWizardSidebarMobile(props: Props) {
  return (
    <div className="mb-4 lg:hidden">
      <BookOrderCalculatorCard {...props} layout="stacked" />
    </div>
  );
}
