import type { ReactNode } from "react";
import { AdminShell } from "@/components/v2/admin/AdminShell";
import { V2AdminPermissionGate } from "@/components/v2/auth/V2AdminPermissionGate";
import { ADMIN_PERMISSIONS } from "@/components/v2/nav-config";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <V2AdminPermissionGate permission={ADMIN_PERMISSIONS}>
      <AdminShell>{children}</AdminShell>
    </V2AdminPermissionGate>
  );
}
