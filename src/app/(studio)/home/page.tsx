import type { Metadata } from "next";
import { V2FeatureGate } from "@/components/v2/auth/V2FeatureGate";
import { V2HomeStudio } from "@/components/v2/home/V2HomeStudio";

export const metadata: Metadata = {
  title: "Home | Colorful Memories",
  robots: { index: false },
};

export default function HomePage() {
  return (
    <V2FeatureGate feature="projects">
      <V2HomeStudio />
    </V2FeatureGate>
  );
}
