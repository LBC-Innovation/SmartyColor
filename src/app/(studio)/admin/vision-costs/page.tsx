import { V2AdminPermissionGate } from "@/components/v2/auth/V2AdminPermissionGate";
import { AiUsageStudio } from "@/components/v2/admin/ai-usage/AiUsageStudio";

export const dynamic = "force-dynamic";

export default function AdminAiUsagePage() {
  return (
    <V2AdminPermissionGate permission="costs:viewai">
      <AiUsageStudio />
    </V2AdminPermissionGate>
  );
}
