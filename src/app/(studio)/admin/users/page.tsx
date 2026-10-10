import { V2AdminPermissionGate } from "@/components/v2/auth/V2AdminPermissionGate";
import { V2AdminUsersStudio } from "@/components/v2/auth/V2AdminUsersStudio";

export default function AdminUsersPage() {
  return (
    <V2AdminPermissionGate permission="usermanage:listusers">
      <V2AdminUsersStudio />
    </V2AdminPermissionGate>
  );
}
