import { AdminOrdersScreen } from "@/components/v2/admin/orders/AdminOrdersScreen";
import { V2AdminPermissionGate } from "@/components/v2/auth/V2AdminPermissionGate";

export default function AdminOrdersPage() {
  return (
    <V2AdminPermissionGate permission="usermanage:manageorders">
      <AdminOrdersScreen />
    </V2AdminPermissionGate>
  );
}
