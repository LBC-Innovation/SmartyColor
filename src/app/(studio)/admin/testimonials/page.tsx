import { V2AdminPermissionGate } from "@/components/v2/auth/V2AdminPermissionGate";
import { V2TestimonialsStudio } from "@/components/v2/email/V2TestimonialsStudio";

export default function AdminTestimonialsPage() {
  return (
    <V2AdminPermissionGate permission="marketing:testimonials">
      <V2TestimonialsStudio />
    </V2AdminPermissionGate>
  );
}
