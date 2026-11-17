import type { Metadata } from "next";
import type { ReactNode } from "react";
import { V2RootProviders } from "@/components/v2/V2RootProviders";

export const metadata: Metadata = {
  title: "Colorful Memories",
  description:
    "Turn your family photos into coloring memories with a clean, modern studio.",
};

export default function V2Layout({ children }: { children: ReactNode }) {
  return (
    <div
      className="v2-shell flex min-h-dvh flex-col bg-v2-bg lg:h-dvh lg:overflow-hidden text-v2-ink"
    >
      <V2RootProviders>
        <div className="flex flex-1 flex-col lg:min-h-0 lg:overflow-hidden">
          {children}
        </div>
      </V2RootProviders>
    </div>
  );
}
