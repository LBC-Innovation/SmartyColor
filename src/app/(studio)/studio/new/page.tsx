import type { Metadata } from "next";
import { Suspense } from "react";
import { NewAlbumWizard } from "@/components/v2/book-packages/NewAlbumWizard";
import { V2FeatureGate } from "@/components/v2/auth/V2FeatureGate";

export const metadata: Metadata = {
  title: "Start with the book | Colorful Memories",
  robots: { index: false, follow: false },
};

/** Where "New album" starts: pick a book and pay once, or just make pages. */
export default function NewAlbumPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col lg:overflow-hidden">
      <V2FeatureGate feature="projects">
        <Suspense fallback={null}>
          <NewAlbumWizard />
        </Suspense>
      </V2FeatureGate>
    </div>
  );
}
