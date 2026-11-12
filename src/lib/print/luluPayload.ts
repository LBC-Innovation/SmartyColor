/**
 * Pure builder for Lulu's "Create a new Print-Job" request body (POST /print-jobs/).
 * Kept dependency-free so scripts/lulu-smoke.mjs can import it directly.
 * Shape per https://api.lulu.com/api-docs/openapi-specs/openapi_public.yml (Print-Jobs create).
 */

export type LuluShippingAddressInput = {
  name?: string | null;
  street1?: string | null;
  street2?: string | null;
  city?: string | null;
  state_code?: string | null;
  postcode?: string | null;
  country_code?: string | null;
  phone_number?: string | null;
  email?: string | null;
};

export type LuluPrintJobPayload = {
  external_id: string;
  contact_email: string;
  shipping_level: string;
  shipping_address: {
    name: string;
    street1: string;
    street2?: string;
    city: string;
    state_code?: string;
    postcode: string;
    country_code: string;
    phone_number: string;
  };
  line_items: Array<{
    external_id: string;
    title: string;
    quantity: number;
    printable_normalization: {
      pod_package_id: string;
      interior: { source_url: string };
      cover: { source_url: string };
    };
  }>;
};

function clean(v: string | null | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Maps the stored order address to Lulu's shape: drops empty optional fields and the email. */
export function toLuluShippingAddress(a: LuluShippingAddressInput): LuluPrintJobPayload["shipping_address"] {
  const street2 = clean(a.street2);
  const state = clean(a.state_code);
  return {
    name: clean(a.name),
    street1: clean(a.street1),
    ...(street2 ? { street2 } : {}),
    city: clean(a.city),
    ...(state ? { state_code: state.toUpperCase() } : {}),
    postcode: clean(a.postcode),
    country_code: (clean(a.country_code) || "US").toUpperCase(),
    phone_number: clean(a.phone_number),
  };
}

export function buildLuluPrintJobPayload(input: {
  orderId: string;
  title: string;
  contactEmail: string;
  shippingLevel: string;
  shippingAddress: LuluShippingAddressInput;
  podPackageId: string;
  interiorUrl: string;
  coverUrl: string;
}): LuluPrintJobPayload {
  return {
    external_id: input.orderId,
    contact_email: input.contactEmail,
    shipping_level: input.shippingLevel,
    shipping_address: toLuluShippingAddress(input.shippingAddress),
    line_items: [
      {
        external_id: `${input.orderId}-1`,
        title: input.title,
        quantity: 1,
        printable_normalization: {
          pod_package_id: input.podPackageId,
          interior: { source_url: input.interiorUrl },
          cover: { source_url: input.coverUrl },
        },
      },
    ],
  };
}

/** Required fields Lulu rejects the job without; returns a human message or null. */
export function validateLuluPayload(p: LuluPrintJobPayload): string | null {
  const a = p.shipping_address;
  if (!p.contact_email) return "Missing contact email";
  if (!a.name || !a.street1 || !a.city || !a.postcode || !a.country_code) {
    return "Shipping address is incomplete";
  }
  if (!a.phone_number) return "Shipping address is missing a phone number (required by Lulu)";
  return null;
}
