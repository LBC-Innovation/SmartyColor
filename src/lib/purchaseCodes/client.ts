import { request } from "@/lib/api/client";
import type { ApiResult } from "@/lib/api/types";
import type {
  AdminPurchaseCode,
  AlbumPurchaseCode,
  CreatePurchaseCodesInput,
  PurchaseCodeChannel,
  PurchaseCodePreview,
} from "@/lib/purchaseCodes/types";

export function fetchPurchaseCodePreview(code: string): Promise<ApiResult<PurchaseCodePreview>> {
  return request(`/purchase-codes/${encodeURIComponent(code)}`);
}

export function redeemPurchaseCode(
  code: string,
  target: { albumId: string } | { albumName: string },
): Promise<ApiResult<{ albumId: string; code: string }>> {
  return request(`/purchase-codes/${encodeURIComponent(code)}/redeem`, {
    method: "POST",
    body: JSON.stringify(target),
  });
}

export function fetchAlbumPurchaseCode(albumId: string): Promise<ApiResult<AlbumPurchaseCode | null>> {
  return request(`/library/projects/${encodeURIComponent(albumId)}/purchase-code`);
}

export function adminListPurchaseCodes(): Promise<ApiResult<AdminPurchaseCode[]>> {
  return request("/admin/purchase-codes");
}

export function adminCreatePurchaseCodes(input: CreatePurchaseCodesInput): Promise<ApiResult<AdminPurchaseCode[]>> {
  return request("/admin/purchase-codes", { method: "POST", body: JSON.stringify(input) });
}

export function adminVoidPurchaseCode(id: string): Promise<ApiResult<{ id: string }>> {
  return request(`/admin/purchase-codes/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** Emails the code (`email`), or logs that it was texted, printed or its link copied. */
export function adminSendPurchaseCode(
  id: string,
  channel: PurchaseCodeChannel,
  to?: string | null,
): Promise<ApiResult<{ ok: true }>> {
  return request(`/admin/purchase-codes/${encodeURIComponent(id)}/send`, {
    method: "POST",
    body: JSON.stringify({ channel, to: to ?? null }),
  });
}
