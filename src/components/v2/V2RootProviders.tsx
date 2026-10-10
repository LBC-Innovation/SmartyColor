"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/context/AuthContext";
import { V2StudioProvider } from "@/components/v2/V2StudioProvider";
import { V2ToastProvider } from "@/components/v2/V2Toast";
import { V2WelcomeGuideProvider } from "@/components/v2/onboarding/V2WelcomeGuide";

export function V2RootProviders({ children }: { children: ReactNode }) {
  return (
    <V2ToastProvider>
      <AuthProvider>
        <V2StudioProvider>
          <V2WelcomeGuideProvider>{children}</V2WelcomeGuideProvider>
        </V2StudioProvider>
      </AuthProvider>
    </V2ToastProvider>
  );
}
