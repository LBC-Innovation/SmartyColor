import { V2AdminPermissionGate } from "@/components/v2/auth/V2AdminPermissionGate";
import { FilesStudio } from "@/components/v2/admin/files/FilesStudio";
import { FILES_PAGE_PERMISSIONS } from "@/lib/files/permissions";

export const dynamic = "force-dynamic";

export default function AdminFilesPage() {
  return (
    <V2AdminPermissionGate permission={FILES_PAGE_PERMISSIONS}>
      <FilesStudio />
    </V2AdminPermissionGate>
  );
}
