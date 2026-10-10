import { V2AdminPermissionGate } from "@/components/v2/auth/V2AdminPermissionGate";
import { V2VisionCostsStudio } from "@/components/v2/V2VisionCostsStudio";

export const dynamic = "force-dynamic";

export default function AdminVisionCostsPage() {
  return (
    <V2AdminPermissionGate permission="usermanage:listusers">
      <V2VisionCostsStudio />
    </V2AdminPermissionGate>
  );
}
