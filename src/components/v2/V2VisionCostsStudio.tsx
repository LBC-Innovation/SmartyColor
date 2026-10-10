"use client";

import { VisionCostDashboard } from "@/components/VisionCostDashboard";
import { V2StudioFrame } from "@/components/v2/V2Chrome";
import {
  ADMIN_CONTENT_CLASS,
  V2AdminToolbar,
} from "@/components/v2/auth/V2AdminSubNav";

export function V2VisionCostsStudio() {
  return (
    <V2StudioFrame>
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
        <V2AdminToolbar />
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-6">
          <div className={`${ADMIN_CONTENT_CLASS} py-6 sm:py-8`}>
            <header className="mb-6">
              <h1 className="v2-brand-title text-2xl tracking-tight text-v2-ink sm:text-3xl">
                Vision API costs
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-v2-muted sm:text-base">
                Live token and cost tracking for this server session. Each
                Gemini vision call is appended to{" "}
                <code className="rounded bg-v2-bg-subtle px-1.5 py-0.5 font-mono text-xs text-v2-ink">
                  .local/vision-api-costs.log
                </code>
                .
              </p>
            </header>
            <VisionCostDashboard variant="v2" />
          </div>
        </main>
      </div>
    </V2StudioFrame>
  );
}
