import { V2AdminPermissionGate } from "@/components/v2/auth/V2AdminPermissionGate";
import { V2AdminOrdersStudio } from "@/components/v2/auth/V2AdminOrdersStudio";

export default function AdminOrdersPage() {
  return (
    <V2AdminPermissionGate permission="usermanage:manageorders">
      <V2AdminOrdersStudio />
    </V2AdminPermissionGate>
  );
}
