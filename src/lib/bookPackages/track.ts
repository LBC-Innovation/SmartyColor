import { centsToValue, trackFormat } from "@/lib/marketing/events";
import type { BookPackagePurchase } from "@/lib/bookPackages/types";
import { track } from "@/lib/track";

/**
 * Send `package_purchased` from the browser once per package (the page that shows the purchase can
 * be opened again). Params are the binding, the amount and an opaque id; nothing personal.
 */
export function trackPackagePurchasedOnce(purchase: BookPackagePurchase, method: "card" | "credit"): void {
  const key = `cm_package_tracked_${purchase.codeId}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
  } catch {
    /* send anyway */
  }
  track("package_purchased", {
    format: trackFormat(purchase.bindingId),
    value: centsToValue(purchase.priceCents),
    currency: "USD",
    method,
    package_id: purchase.codeId,
  });
}
