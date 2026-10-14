import { Suspense } from "react";
import { V2BookOrderWizardRoute } from "@/components/v2/book-order/V2BookOrderWizard";

export const dynamic = "force-dynamic";

export default function BookOrderWizardPage() {
  return (
    <Suspense fallback={null}>
      <V2BookOrderWizardRoute />
    </Suspense>
  );
}
