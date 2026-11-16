import { V2AdminPermissionGate } from "@/components/v2/auth/V2AdminPermissionGate";
import { PricingStudio } from "@/components/v2/admin/pricing/PricingStudio";

export default function AdminPricingPage() {
  return (
    <V2AdminPermissionGate permission={["pricing:manage", "usermanage:adjustcredits"]}>
      <PricingStudio />
    </V2AdminPermissionGate>
  );
}
