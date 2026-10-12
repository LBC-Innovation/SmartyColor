import { V2AdminPermissionGate } from "@/components/v2/auth/V2AdminPermissionGate";
import { V2PromoCreditsStudio } from "@/components/v2/auth/V2PromoCreditsStudio";

export default function AdminPromoCreditsPage() {
  return (
    <V2AdminPermissionGate permission="usermanage:adjustcredits">
      <V2PromoCreditsStudio />
    </V2AdminPermissionGate>
  );
}
