import { V2AdminPermissionGate } from "@/components/v2/auth/V2AdminPermissionGate";
import { PurchaseCodesStudio } from "@/components/v2/admin/purchase-codes/PurchaseCodesStudio";
import { PURCHASE_CODES_PERMISSION } from "@/lib/purchaseCodes/permissions";

export const dynamic = "force-dynamic";

export default function AdminPurchaseCodesPage() {
  return (
    <V2AdminPermissionGate permission={PURCHASE_CODES_PERMISSION}>
      <PurchaseCodesStudio />
    </V2AdminPermissionGate>
  );
}
