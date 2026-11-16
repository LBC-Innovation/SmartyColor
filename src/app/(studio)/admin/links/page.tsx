import { V2AdminPermissionGate } from "@/components/v2/auth/V2AdminPermissionGate";
import { LinksStudio } from "@/components/v2/admin/links/LinksStudio";

export const dynamic = "force-dynamic";

export default function AdminLinksPage() {
  return (
    <V2AdminPermissionGate permission="finance:view">
      <LinksStudio />
    </V2AdminPermissionGate>
  );
}
