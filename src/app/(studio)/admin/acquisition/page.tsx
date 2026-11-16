import { V2AdminPermissionGate } from "@/components/v2/auth/V2AdminPermissionGate";
import { AcquisitionStudio } from "@/components/v2/admin/acquisition/AcquisitionStudio";

export const dynamic = "force-dynamic";

export default function AdminAcquisitionPage() {
  return (
    <V2AdminPermissionGate permission="finance:view">
      <AcquisitionStudio />
    </V2AdminPermissionGate>
  );
}
