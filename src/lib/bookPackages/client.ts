import { request } from "@/lib/api/client";
import type { ApiResult } from "@/lib/api/types";
import type {
  AdminBookPackage,
  AdminBookPackageUpdate,
  BookPackageConfirmation,
  BookPackageList,
  BookPackagePurchase,
  BookPackageRefund,
  BookPackageRefundQuote,
  BookPackageShippingInput,
  BookPackageShippingQuote,
} from "@/lib/bookPackages/types";
import type { ShippingLevel } from "@/lib/orders/shippingLevels";
import type { ShippingAddress } from "@/lib/orders/types";
import type { BookBindingId } from "@/lib/print/bookBindings";

export function fetchBookPackages(): Promise<ApiResult<BookPackageList>> {
  return request("/book-packages");
}

export function buyPackageWithCredit(input: {
  bindingId: BookBindingId;
  albumName?: string;
  expectedPriceCents: number;
  shipping?: BookPackageShippingInput;
}): Promise<ApiResult<BookPackagePurchase>> {
  return request("/book-packages/buy", { method: "POST", body: JSON.stringify(input) });
}

export function startPackageCheckout(input: {
  bindingId: BookBindingId;
  albumName?: string;
  expectedPriceCents: number;
  shipping?: BookPackageShippingInput;
}): Promise<ApiResult<{ checkoutUrl: string }>> {
  return request("/book-packages/checkout", { method: "POST", body: JSON.stringify(input) });
}

/** Standard shipping (with its tax) for the package's book to this address. */
export function quotePackageShipping(
  bindingId: BookBindingId,
  address: ShippingAddress,
  shippingLevel: ShippingLevel,
): Promise<ApiResult<BookPackageShippingQuote>> {
  return request("/book-packages/shipping-quote", {
    method: "POST",
    body: JSON.stringify({ bindingId, address, shippingLevel }),
  });
}

export function confirmPackageCheckout(sessionId: string): Promise<ApiResult<BookPackageConfirmation>> {
  return request("/book-packages/confirm", { method: "POST", body: JSON.stringify({ sessionId }) });
}

export function adminListBookPackages(): Promise<ApiResult<AdminBookPackage[]>> {
  return request("/admin/book-packages");
}

export function adminUpdateBookPackage(
  bindingId: BookBindingId,
  update: AdminBookPackageUpdate,
): Promise<ApiResult<AdminBookPackage>> {
  return request(`/admin/book-packages/${encodeURIComponent(bindingId)}`, {
    method: "PUT",
    body: JSON.stringify(update),
  });
}

/** What canceling the album's book package would return to the wallet (null without a package). */
export function fetchPackageRefundQuote(albumId: string): Promise<ApiResult<BookPackageRefundQuote | null>> {
  return request(`/library/projects/${encodeURIComponent(albumId)}/package-refund`);
}

/** Cancel the album's book package; its unused value goes back to the wallet. */
export function cancelBookPackage(albumId: string, deleteAlbum: boolean): Promise<ApiResult<BookPackageRefund>> {
  return request(`/library/projects/${encodeURIComponent(albumId)}/package-refund`, {
    method: "POST",
    body: JSON.stringify({ deleteAlbum }),
  });
}
