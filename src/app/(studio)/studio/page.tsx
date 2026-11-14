import type { Metadata } from "next";
import { Suspense } from "react";
import { ColorfulMemoriesApp } from "@/components/v2/ColorfulMemoriesApp";
import { V2FeatureGate } from "@/components/v2/auth/V2FeatureGate";

export const metadata: Metadata = {
  title: "Your albums | Colorful Memories",
  robots: { index: false },
};

export default function StudioPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <h1 className="sr-only">Your albums</h1>
      <V2FeatureGate feature="projects">
        {/* The studio reads ?cart= and ?checkout= (saved books, the return from adding credit). */}
        <Suspense fallback={null}>
          <ColorfulMemoriesApp />
        </Suspense>
      </V2FeatureGate>
    </div>
  );
}
