"use client";

import type { ReactNode } from "react";
import { AuthProvider } from "@/context/AuthContext";
import { V2StudioProvider } from "@/components/v2/V2StudioProvider";
import { V2ToastProvider } from "@/components/v2/V2Toast";

export function V2RootProviders({ children }: { children: ReactNode }) {
  return (
    <V2ToastProvider>
      <AuthProvider>
        <V2StudioProvider>{children}</V2StudioProvider>
      </AuthProvider>
    </V2ToastProvider>
  );
}
