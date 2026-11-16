import { V2AdminPermissionGate } from "@/components/v2/auth/V2AdminPermissionGate";
import { GuestsStudio } from "@/components/v2/admin/guests/GuestsStudio";

export const dynamic = "force-dynamic";

export default function AdminGuestsPage() {
  return (
    <V2AdminPermissionGate permission="costs:viewai">
      <GuestsStudio />
    </V2AdminPermissionGate>
  );
}
