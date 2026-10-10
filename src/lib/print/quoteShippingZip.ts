export const QUOTE_SHIPPING_ZIP_STORAGE_KEY = "cm_quote_shipping_zip";

export function readStoredQuoteShippingZip(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(QUOTE_SHIPPING_ZIP_STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function storeQuoteShippingZip(zip: string): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = zip.trim();
    if (!trimmed) {
      localStorage.removeItem(QUOTE_SHIPPING_ZIP_STORAGE_KEY);
      return;
    }
    localStorage.setItem(QUOTE_SHIPPING_ZIP_STORAGE_KEY, trimmed);
  } catch {
    /* ignore */
  }
}
