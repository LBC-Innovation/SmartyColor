"use client";

import { VisionCostDashboard } from "@/components/VisionCostDashboard";
import { V2Sidebar, V2StudioFrame } from "@/components/v2/V2Chrome";

export function V2VisionCostsStudio() {
  return (
    <V2StudioFrame sidebar={<V2Sidebar showProgress={false} />}>
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-6">
        <div className="mx-auto w-full max-w-4xl px-5 py-6 sm:px-8 sm:py-8">
          <header className="mb-6">
            <h1 className="v2-brand-title text-2xl tracking-tight text-v2-ink sm:text-3xl">
              Vision API costs
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-v2-muted sm:text-base">
              Live token and cost tracking for this server session. Each Gemini
              vision call is appended to{" "}
              <code className="rounded bg-v2-bg-subtle px-1.5 py-0.5 font-mono text-xs text-v2-ink">
                .local/vision-api-costs.log
              </code>
              .
            </p>
          </header>
          <VisionCostDashboard variant="v2" />
        </div>
      </main>
    </V2StudioFrame>
  );
}
