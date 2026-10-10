import { luluFetch } from "@/server/lulu/client";

export type LuluShippingOption = {
  id: number;
  level: string;
  min_delivery_date?: string;
  max_delivery_date?: string;
  min_dispatch_date?: string;
  max_dispatch_date?: string;
  total_days_min?: number;
  total_days_max?: number;
  traceable?: boolean;
};

type ShippingOptionsResponse = LuluShippingOption[] | { shipping_options?: LuluShippingOption[] };

export async function fetchLuluShippingOptions(input: {
  podPackageId: string;
  pageCount: number;
  quantity: number;
  countryCode: string;
  currency?: string;
}): Promise<LuluShippingOption[]> {
  const payload = {
    currency: input.currency ?? "USD",
    line_items: [
      {
        pod_package_id: input.podPackageId,
        page_count: input.pageCount,
        quantity: input.quantity,
      },
    ],
    shipping_address: {
      country_code: input.countryCode,
    },
  };

  const raw = await luluFetch<ShippingOptionsResponse>("/shipping-options/", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (Array.isArray(raw)) return raw;
  return raw.shipping_options ?? [];
}

export function pickShippingOption(
  options: LuluShippingOption[],
  level: string,
): LuluShippingOption | null {
  const match = options.find((o) => o.level === level);
  return match ?? options[0] ?? null;
}
