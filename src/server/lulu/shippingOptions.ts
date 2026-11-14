import { luluFetch } from "@/server/lulu/client";
import { isShippingLevel, SHIPPING_LEVEL_LABELS, type ShippingChoice } from "@/lib/orders/shippingLevels";

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
  carrier_service_name?: string;
  cost_excl_tax?: number | string;
  is_active?: boolean;
  home_only?: boolean;
  business_only?: boolean;
};

type ShippingOptionsResponse = LuluShippingOption[] | { shipping_options?: LuluShippingOption[] };

export async function fetchLuluShippingOptions(input: {
  podPackageId: string;
  pageCount: number;
  quantity: number;
  countryCode: string;
  /** More of the address makes the dates more exact; the country alone is enough to ask. */
  address?: { state_code?: string; postcode?: string; city?: string };
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
      ...(input.address?.state_code ? { state_code: input.address.state_code } : {}),
      ...(input.address?.postcode ? { postcode: input.address.postcode } : {}),
      ...(input.address?.city ? { city: input.address.city } : {}),
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

/** Lulu's dates for one shipping level: when it should leave the printer and when it should arrive. */
export type LuluDeliveryEstimate = {
  deliveryMin: string | null;
  deliveryMax: string | null;
  dispatchMin: string | null;
  dispatchMax: string | null;
};

/**
 * The printer's estimated dispatch and delivery dates for one book at one shipping level, or null
 * when Lulu doesn't answer in time or doesn't offer that level. Never throws: a missing estimate
 * must never block a quote or an order.
 */
export async function estimateLuluDelivery(
  input: {
    podPackageId: string;
    pageCount: number;
    shippingLevel: string;
    address: { country_code?: string; state_code?: string; postcode?: string; city?: string };
  },
  timeoutMs = 4000,
): Promise<LuluDeliveryEstimate | null> {
  const ask = fetchLuluShippingOptions({
    podPackageId: input.podPackageId,
    pageCount: input.pageCount,
    quantity: 1,
    countryCode: (input.address.country_code || "US").toUpperCase(),
    address: input.address,
  })
    .then((options) => {
      // Only the level the order really ships with; another level's dates would mislead.
      const option = options.find((o) => o.level === input.shippingLevel);
      if (!option || (!option.min_delivery_date && !option.max_delivery_date)) return null;
      return {
        deliveryMin: option.min_delivery_date ?? null,
        deliveryMax: option.max_delivery_date ?? null,
        dispatchMin: option.min_dispatch_date ?? null,
        dispatchMax: option.max_dispatch_date ?? null,
      };
    })
    .catch((e: unknown) => {
      console.warn(
        JSON.stringify({
          level: "warn",
          message: "lulu delivery estimate failed",
          error: e instanceof Error ? e.message : String(e),
        }),
      );
      return null;
    });
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
  return Promise.race([ask, timeout]);
}

/**
 * Every shipping level Lulu offers for this book and address that customers may pick, cheapest
 * first, with cost and delivery dates. Null when Lulu doesn't answer in time. Never throws.
 */
export async function luluShippingChoices(
  input: {
    podPackageId: string;
    pageCount: number;
    address: { country_code?: string; state_code?: string; postcode?: string; city?: string };
  },
  timeoutMs = 4000,
): Promise<ShippingChoice[] | null> {
  const ask = fetchLuluShippingOptions({
    podPackageId: input.podPackageId,
    pageCount: input.pageCount,
    quantity: 1,
    countryCode: (input.address.country_code || "US").toUpperCase(),
    address: input.address,
  })
    .then((options) => {
      const seen = new Set<string>();
      const choices: ShippingChoice[] = [];
      for (const option of options) {
        // Business-only services can't reach a home address; inactive ones can't be booked.
        if (!isShippingLevel(option.level) || option.is_active === false || option.business_only) continue;
        if (seen.has(option.level)) continue;
        seen.add(option.level);
        const cost = Number(option.cost_excl_tax);
        choices.push({
          level: option.level,
          label: SHIPPING_LEVEL_LABELS[option.level],
          service: option.carrier_service_name?.trim() || null,
          costCents: Number.isFinite(cost) ? Math.round(cost * 100) : null,
          deliveryMin: option.min_delivery_date ?? null,
          deliveryMax: option.max_delivery_date ?? null,
        });
      }
      return choices.sort((a, b) => (a.costCents ?? Infinity) - (b.costCents ?? Infinity));
    })
    .catch((e: unknown) => {
      console.warn(
        JSON.stringify({
          level: "warn",
          message: "lulu shipping options failed",
          error: e instanceof Error ? e.message : String(e),
        }),
      );
      return null;
    });
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
  return Promise.race([ask, timeout]);
}
