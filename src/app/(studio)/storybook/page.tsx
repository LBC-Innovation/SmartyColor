import { V2FeatureGate } from "@/components/v2/auth/V2FeatureGate";
import { V2StoryBookApp } from "@/components/v2/storybook/V2StoryBookApp";

export default function V2StoryBookPage() {
  return (
    <V2FeatureGate feature="storybook">
      <V2StoryBookApp />
    </V2FeatureGate>
  );
}
