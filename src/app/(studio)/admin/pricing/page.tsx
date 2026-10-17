import { V2AdminPermissionGate } from "@/components/v2/auth/V2AdminPermissionGate";
import { V2PricingStudio } from "@/components/v2/auth/V2PricingStudio";
import { MANAGE_PRICES_PERMISSION } from "@/lib/api/types";

export default function AdminPricingPage() {
  return (
    <V2AdminPermissionGate permission={MANAGE_PRICES_PERMISSION}>
      <V2PricingStudio />
    </V2AdminPermissionGate>
  );
}
