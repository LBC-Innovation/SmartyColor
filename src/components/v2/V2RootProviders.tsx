"use client";

import { Suspense, type ReactNode } from "react";
import { AuthProvider } from "@/context/AuthContext";
import { V2StudioProvider } from "@/components/v2/V2StudioProvider";
import { V2ToastProvider } from "@/components/v2/V2Toast";
import { V2WelcomeGuideProvider } from "@/components/v2/onboarding/V2WelcomeGuide";
import { PageViewTracker } from "@/components/v2/PageViewTracker";

export function V2RootProviders({ children }: { children: ReactNode }) {
  return (
    <V2ToastProvider>
      <AuthProvider>
        {/* useSearchParams needs its own boundary so static pages stay static. */}
        <Suspense fallback={null}>
          <PageViewTracker />
        </Suspense>
        <V2StudioProvider>
          <V2WelcomeGuideProvider>{children}</V2WelcomeGuideProvider>
        </V2StudioProvider>
      </AuthProvider>
    </V2ToastProvider>
  );
}
