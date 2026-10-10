export type UsPostcodeLocation = {
  city: string;
  stateCode: string;
  postcode: string;
};

export function normalizeUsPostcode(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 5) return digits;
  if (digits.length === 9) return digits.slice(0, 5);
  return null;
}

export async function lookupUsPostcode(postcode: string): Promise<UsPostcodeLocation> {
  const normalized = normalizeUsPostcode(postcode);
  if (!normalized) {
    throw new Error("Enter a valid 5-digit US ZIP code");
  }

  const res = await fetch(`https://api.zippopotam.us/us/${normalized}`, {
    signal: AbortSignal.timeout(8_000),
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error("Could not find that ZIP code");
  }

  const data = (await res.json()) as {
    places?: Array<{ "place name"?: string; "state abbreviation"?: string }>;
  };
  const place = data.places?.[0];
  const city = place?.["place name"]?.trim();
  const stateCode = place?.["state abbreviation"]?.trim();
  if (!city || !stateCode) {
    throw new Error("Could not resolve city and state for that ZIP code");
  }

  return { city, stateCode, postcode: normalized };
}
