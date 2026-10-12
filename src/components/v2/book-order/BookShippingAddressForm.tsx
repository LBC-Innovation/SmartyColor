"use client";

import type { ShippingAddress } from "@/lib/orders/types";
import { US_STATE_CODES, type ShippingAddressErrors } from "@/lib/orders/shippingAddress";
import { cn } from "@/lib/cn";

type Props = {
  value: ShippingAddress;
  onChange: (next: ShippingAddress) => void;
  errors?: ShippingAddressErrors;
  idPrefix?: string;
  className?: string;
};

type FieldKey = keyof ShippingAddress;

function Field({
  id,
  label,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="v2-label">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** The numeric keypad has no hyphen, so add the ZIP+4 one once a sixth digit is typed. */
function formatUsZip(raw: string): string {
  return /^\d{6,9}$/.test(raw) ? `${raw.slice(0, 5)}-${raw.slice(5)}` : raw;
}

/** Lulu-ready shipping address; US-first, with a country select for the rest. */
export function BookShippingAddressForm({ value, onChange, errors = {}, idPrefix = "ship", className }: Props) {
  const set = (key: FieldKey, v: string) => onChange({ ...value, [key]: v });
  const inputClass = (key: FieldKey) =>
    cn("v2-input", errors[key] && "border-red-400 focus:border-red-500");
  const isUs = (value.country_code || "US") === "US";

  return (
    <div className={cn("grid gap-3 sm:grid-cols-2", className)}>
      <Field id={`${idPrefix}-name`} label="Full name" error={errors.name} className="sm:col-span-2">
        <input
          autoCapitalize="words"
          enterKeyHint="next"
          id={`${idPrefix}-name`}
          className={inputClass("name")}
          autoComplete="shipping name"
          value={value.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </Field>

      <Field id={`${idPrefix}-street1`} label="Street address" error={errors.street1} className="sm:col-span-2">
        <input
          autoCapitalize="words"
          enterKeyHint="next"
          id={`${idPrefix}-street1`}
          className={inputClass("street1")}
          autoComplete="shipping address-line1"
          value={value.street1}
          onChange={(e) => set("street1", e.target.value)}
        />
      </Field>

      <Field id={`${idPrefix}-street2`} label="Apt, suite, etc. (optional)" className="sm:col-span-2">
        <input
          autoCapitalize="words"
          enterKeyHint="next"
          id={`${idPrefix}-street2`}
          className="v2-input"
          autoComplete="shipping address-line2"
          value={value.street2 ?? ""}
          onChange={(e) => set("street2", e.target.value)}
        />
      </Field>

      <Field id={`${idPrefix}-city`} label="City" error={errors.city}>
        <input
          autoCapitalize="words"
          enterKeyHint="next"
          id={`${idPrefix}-city`}
          className={inputClass("city")}
          autoComplete="shipping address-level2"
          value={value.city}
          onChange={(e) => set("city", e.target.value)}
        />
      </Field>

      {isUs ? (
        <Field id={`${idPrefix}-state`} label="State" error={errors.state_code}>
          <select
            id={`${idPrefix}-state`}
            className={inputClass("state_code")}
            autoComplete="shipping address-level1"
            value={value.state_code ?? ""}
            onChange={(e) => set("state_code", e.target.value)}
          >
            <option value="">Select…</option>
            {US_STATE_CODES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <Field id={`${idPrefix}-state`} label="State / region (optional)">
          <input
            id={`${idPrefix}-state`}
            className="v2-input"
            autoComplete="shipping address-level1"
            value={value.state_code ?? ""}
            onChange={(e) => set("state_code", e.target.value)}
          />
        </Field>
      )}

      <Field id={`${idPrefix}-postcode`} label={isUs ? "ZIP code" : "Postal code"} error={errors.postcode}>
        <input
          id={`${idPrefix}-postcode`}
          className={cn(inputClass("postcode"), "tabular-nums")}
          inputMode={isUs ? "numeric" : "text"}
          autoComplete="shipping postal-code"
          maxLength={12}
          value={value.postcode}
          onChange={(e) => set("postcode", isUs ? formatUsZip(e.target.value) : e.target.value)}
        />
      </Field>

      <Field id={`${idPrefix}-country`} label="Country" error={errors.country_code}>
        <select
          id={`${idPrefix}-country`}
          className={inputClass("country_code")}
          autoComplete="shipping country"
          value={value.country_code || "US"}
          onChange={(e) => set("country_code", e.target.value)}
        >
          <option value="US">United States</option>
          <option value="CA">Canada</option>
          <option value="GB">United Kingdom</option>
          <option value="AU">Australia</option>
        </select>
      </Field>

      <Field id={`${idPrefix}-phone`} label="Phone" error={errors.phone_number}>
        <input
          id={`${idPrefix}-phone`}
          type="tel"
          className={inputClass("phone_number")}
          autoComplete="shipping tel"
          value={value.phone_number}
          onChange={(e) => set("phone_number", e.target.value)}
        />
      </Field>

      <Field id={`${idPrefix}-email`} label="Email for shipping updates (optional)" error={errors.email}>
        <input
          id={`${idPrefix}-email`}
          type="email"
          className={inputClass("email")}
          autoComplete="email"
          value={value.email ?? ""}
          onChange={(e) => set("email", e.target.value)}
        />
      </Field>
    </div>
  );
}
