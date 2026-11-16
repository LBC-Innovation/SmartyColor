import { V2AdminPermissionGate } from "@/components/v2/auth/V2AdminPermissionGate";
import { CustomersStudio } from "@/components/v2/admin/customers/CustomersStudio";

export default function AdminUsersPage() {
  return (
    <V2AdminPermissionGate permission="usermanage:listusers">
      <CustomersStudio />
    </V2AdminPermissionGate>
  );
}
