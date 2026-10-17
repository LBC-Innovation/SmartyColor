import { V2AdminPermissionGate } from "@/components/v2/auth/V2AdminPermissionGate";
import { V2FinanceStudio } from "@/components/v2/finance/V2FinanceStudio";
import { FINANCE_VIEW_PERMISSION } from "@/lib/finance/types";

export default function AdminFinancePage() {
  return (
    <V2AdminPermissionGate permission={FINANCE_VIEW_PERMISSION}>
      <V2FinanceStudio />
    </V2AdminPermissionGate>
  );
}
