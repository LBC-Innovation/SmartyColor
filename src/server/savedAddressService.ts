import "server-only";
import type { ApiResult } from "@/lib/api/types";
import { normalizeShippingAddress, validateBillingAddress } from "@/lib/orders/shippingAddress";
import type { ShippingAddress } from "@/lib/orders/types";
import { getSupabaseAdmin } from "@/lib/supabase/service";

const err = (message: string, code?: string): ApiResult<never> => ({ data: null, error: { message, ...(code ? { code } : {}) } });

/** The address the customer saved for future orders, or null when they haven't saved one. */
export async function getSavedAddress(userId: string): Promise<ApiResult<ShippingAddress | null>> {
  const { data, error } = await getSupabaseAdmin()
    .from("profiles")
    .select("saved_address")
    .eq("id", userId)
    .maybeSingle();
  if (error) return err(error.message);
  const saved = data?.saved_address as Partial<ShippingAddress> | null | undefined;
  return { data: saved ? normalizeShippingAddress(saved) : null, error: null };
}

/** Keeps the address for future orders. It may be a billing address, so no phone is required. */
export async function saveAddress(userId: string, input: Partial<ShippingAddress> | null): Promise<ApiResult<ShippingAddress>> {
  if (!input || Object.keys(validateBillingAddress(input)).length > 0) {
    return err("Complete the address before saving it", "INVALID_ADDRESS");
  }
  const address = normalizeShippingAddress(input);
  const { error } = await getSupabaseAdmin().from("profiles").update({ saved_address: address }).eq("id", userId);
  if (error) return err(error.message);
  return { data: address, error: null };
}

export async function clearSavedAddress(userId: string): Promise<ApiResult<{ cleared: true }>> {
  const { error } = await getSupabaseAdmin().from("profiles").update({ saved_address: null }).eq("id", userId);
  if (error) return err(error.message);
  return { data: { cleared: true }, error: null };
}
