"use client";

import { useEffect, useState } from "react";
import { Loader2, MapPin, Pencil, Plus } from "lucide-react";
import { BookShippingAddressForm } from "@/components/v2/book-order/BookShippingAddressForm";
import * as api from "@/lib/api/client";
import {
  EMPTY_SHIPPING_ADDRESS,
  formatShippingAddress,
  normalizeShippingAddress,
  validateBillingAddress,
  type ShippingAddressErrors,
} from "@/lib/orders/shippingAddress";
import type { ShippingAddress } from "@/lib/orders/types";

/**
 * The address kept on the account for future orders (checkout's "Save this
 * address for future orders"). Checkout prefills from it.
 */
export function V2SavedAddressPanel({ userId }: { userId: string }) {
  /** undefined while loading, null when nothing is saved. */
  const [saved, setSaved] = useState<ShippingAddress | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ShippingAddress | null>(null);
  const [errors, setErrors] = useState<ShippingAddressErrors>({});
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.fetchSavedAddress().then((result) => {
      if (cancelled) return;
      if (api.isError(result)) {
        setLoadError(result.error.message);
        return;
      }
      setLoadError(null);
      setSaved(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  function startEditing() {
    setDraft({ ...EMPTY_SHIPPING_ADDRESS, ...(saved ?? {}) });
    setErrors({});
    setSaveError(null);
  }

  function updateDraft(next: ShippingAddress) {
    setDraft(next);
    if (Object.keys(errors).length > 0) setErrors(validateBillingAddress(next));
  }

  async function save() {
    if (!draft) return;
    const nextErrors = validateBillingAddress(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setBusy(true);
    setSaveError(null);
    const result = await api.saveAddress(normalizeShippingAddress(draft));
    setBusy(false);
    if (api.isError(result)) {
      setSaveError(result.error.message);
      return;
    }
    setSaved(result.data);
    setDraft(null);
  }

  async function remove() {
    setBusy(true);
    setSaveError(null);
    const result = await api.clearSavedAddress();
    setBusy(false);
    if (api.isError(result)) {
      setSaveError(result.error.message);
      return;
    }
    setSaved(null);
    setDraft(null);
  }

  return (
    <section className="v2-panel p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold text-v2-ink">Saved address</h2>
        {draft == null && saved ? (
          <button type="button" className="text-sm font-semibold text-v2-link hover:underline" onClick={startEditing}>
            <Pencil className="mr-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
            Edit
          </button>
        ) : null}
      </div>
      <p className="mt-0.5 text-xs text-v2-muted">Filled in for you when you order a printed book.</p>

      {loadError ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {loadError}
        </p>
      ) : saved === undefined ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-v2-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading…
        </p>
      ) : draft ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <BookShippingAddressForm
            className="mt-4"
            idPrefix="saved"
            value={draft}
            onChange={updateDraft}
            errors={errors}
          />
          {saveError ? (
            <p className="mt-3 text-sm text-red-700" role="alert">
              {saveError}
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button type="submit" className="v2-btn-primary text-sm" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Save address
            </button>
            <button type="button" className="v2-btn-outline text-sm" disabled={busy} onClick={() => setDraft(null)}>
              Cancel
            </button>
            {saved ? (
              <button
                type="button"
                className="ml-auto text-sm font-semibold text-red-700 hover:underline disabled:opacity-50"
                disabled={busy}
                onClick={() => void remove()}
              >
                Remove address
              </button>
            ) : null}
          </div>
        </form>
      ) : saved ? (
        <address className="mt-3 flex items-start gap-2 text-sm not-italic text-v2-ink">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-v2-muted" aria-hidden />
          <span>
            {formatShippingAddress(saved)}
            {saved.phone_number ? <span className="block text-v2-muted tabular-nums">{saved.phone_number}</span> : null}
          </span>
        </address>
      ) : (
        <div className="mt-3">
          <p className="text-sm text-v2-muted">No address saved yet.</p>
          <button type="button" className="v2-btn-outline mt-3 text-sm" onClick={startEditing}>
            <Plus className="h-4 w-4" aria-hidden />
            Add address
          </button>
        </div>
      )}
    </section>
  );
}
