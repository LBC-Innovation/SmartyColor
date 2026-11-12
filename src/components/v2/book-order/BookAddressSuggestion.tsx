"use client";

import type { AddressSuggestion, ShippingAddress } from "@/lib/orders/types";

type Props = {
  entered: ShippingAddress;
  suggestion: AddressSuggestion;
  onUse: () => void;
  onKeep: () => void;
  className?: string;
};

function lines(a: Partial<ShippingAddress>): string[] {
  const cityLine = [a.city, [a.state_code, a.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [a.street1, a.street2, cityLine, a.country_code && a.country_code !== "US" ? a.country_code : ""].filter(
    (l): l is string => Boolean(l),
  );
}

/** The suggestion laid over what was typed, so the apartment line the customer entered still shows. */
export function applySuggestion(entered: ShippingAddress, suggestion: AddressSuggestion): ShippingAddress {
  const s = suggestion.suggested;
  return {
    ...entered,
    street1: s.street1 ?? entered.street1,
    city: s.city ?? entered.city,
    state_code: s.state_code ?? entered.state_code,
    postcode: s.postcode ?? entered.postcode,
    country_code: s.country_code ?? entered.country_code,
    // A missing street2 means "no opinion"; never wipe the customer's apartment line.
    street2: s.street2 ? s.street2 : entered.street2,
  };
}

/** A non-blocking "Did you mean…?" under the address form. The printer only warns; checkout carries on. */
export function BookAddressSuggestion({ entered, suggestion, onUse, onKeep, className }: Props) {
  const proposed = applySuggestion(entered, suggestion);
  return (
    <div
      className={`rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950 ${className ?? ""}`}
      role="status"
    >
      <p className="font-semibold">Did you mean…?</p>
      <p className="mt-0.5 text-xs">The printer found a slightly different version of this address.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-900/70">You entered</p>
          {lines(entered).map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-900/70">Suggested</p>
          {lines(proposed).map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="v2-btn-sm v2-btn-sm-primary" onClick={onUse}>
          Use suggested address
        </button>
        <button type="button" className="v2-btn-sm v2-btn-outline" onClick={onKeep}>
          Keep what I entered
        </button>
      </div>
    </div>
  );
}
