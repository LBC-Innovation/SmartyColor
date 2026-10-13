import { ColorfulMemoriesApp } from "@/components/v2/ColorfulMemoriesApp";
import { V2FeatureGate } from "@/components/v2/auth/V2FeatureGate";

export default function StudioPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <V2FeatureGate feature="projects">
        <ColorfulMemoriesApp />
      </V2FeatureGate>
    </div>
  );
}
