import type { ShippingAddress } from "@/lib/orders/types";

export type ShippingAddressErrors = Partial<Record<keyof ShippingAddress, string>>;

export const EMPTY_SHIPPING_ADDRESS: ShippingAddress = {
  name: "",
  street1: "",
  street2: "",
  city: "",
  state_code: "",
  postcode: "",
  country_code: "US",
  phone_number: "",
  email: "",
};

export const US_STATE_CODES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY",
  "LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH",
  "OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
] as const;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Trim every field and uppercase the codes; safe for client and server. */
export function normalizeShippingAddress(input: Partial<ShippingAddress> | null | undefined): ShippingAddress {
  return {
    name: clean(input?.name),
    street1: clean(input?.street1),
    street2: clean(input?.street2) || undefined,
    city: clean(input?.city),
    state_code: clean(input?.state_code).toUpperCase() || undefined,
    postcode: clean(input?.postcode),
    country_code: (clean(input?.country_code) || "US").toUpperCase(),
    phone_number: clean(input?.phone_number),
    email: clean(input?.email) || undefined,
  };
}

/** Field-level validation matching what Lulu requires to accept a print job. */
export function validateShippingAddress(input: Partial<ShippingAddress> | null | undefined): ShippingAddressErrors {
  const a = normalizeShippingAddress(input);
  const errors: ShippingAddressErrors = {};

  if (!a.name) errors.name = "Who should we address it to?";
  if (!a.street1) errors.street1 = "Street address is required.";
  if (!a.city) errors.city = "City is required.";
  if (!a.country_code || a.country_code.length !== 2) errors.country_code = "Pick a country.";

  if (a.country_code === "US") {
    if (!a.state_code || !(US_STATE_CODES as readonly string[]).includes(a.state_code)) {
      errors.state_code = "Pick a state.";
    }
    if (!/^\d{5}(-\d{4})?$/.test(a.postcode)) errors.postcode = "Enter a 5-digit ZIP code.";
  } else if (!a.postcode) {
    errors.postcode = "Postal code is required.";
  }

  const digits = a.phone_number.replace(/\D/g, "");
  if (digits.length < 10) errors.phone_number = "Enter a phone number with area code (the carrier may call).";

  if (a.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)) errors.email = "That email doesn't look right.";

  return errors;
}

export function isShippingAddressComplete(input: Partial<ShippingAddress> | null | undefined): boolean {
  return Object.keys(validateShippingAddress(input)).length === 0;
}

/** One-line summary for confirmations and order pages. */
export function formatShippingAddress(a: Partial<ShippingAddress> | null | undefined): string {
  if (!a) return "";
  const parts = [
    a.name,
    [a.street1, a.street2].filter(Boolean).join(", "),
    [a.city, a.state_code, a.postcode].filter(Boolean).join(" "),
    a.country_code && a.country_code !== "US" ? a.country_code : null,
  ].filter(Boolean);
  return parts.join(" · ");
}
