import "server-only";
import { unstable_cache } from "next/cache";
import { BOOK_BINDINGS, type BookBindingId } from "@/lib/print/bookBindings";
import type { NumbersInput } from "@/lib/marketing/copy";
import { luluConfigured } from "@/server/lulu/config";
import { chargeableCents, pricePrintOrder } from "@/server/pricingService";
import { getPromoCreditSettings } from "@/server/promoCreditsService";

/**
 * Numbers the marketing pages quote, always from the real pricing code. A number that can't be
 * read is null and its line is hidden; nothing here is ever guessed or hardcoded.
 */

/** The book behind "Printed books from $X": confirm with Zach before changing. */
export const REFERENCE_BOOK: { bindingId: BookBindingId; pageCount: number } = {
  bindingId: "saddle_stitch",
  pageCount: 24,
};

const DAY_SECONDS = 24 * 60 * 60;

function log(level: string, message: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, message, ...ctx }));
}

// Throws on failure so a failed quote is never cached; the wrapper below turns that into null.
const cachedReferencePrice = unstable_cache(
  async (): Promise<number> => {
    if (!luluConfigured()) throw new Error("Lulu is not configured");
    // Default quote address (LULU_QUOTE_* or the standard US address) and default shipping level.
    const priced = await pricePrintOrder(REFERENCE_BOOK);
    if (priced.error) throw new Error(priced.error.message);
    // Book plus shipping, before sales tax (which depends on the state it ships to).
    const { printPriceCents, shippingCents } = priced.data.price;
    return printPriceCents + shippingCents;
  },
  ["marketing-reference-price-v1"],
  { revalidate: DAY_SECONDS },
);

/** What the reference book costs shipped to a standard US address, in cents; null if unknown. */
export async function getReferencePrice(): Promise<number | null> {
  try {
    return await cachedReferencePrice();
  } catch (e) {
    log("warn", "Reference price unavailable", { error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

const cachedWelcomeCredit = unstable_cache(
  async (): Promise<number> => {
    const settings = await getPromoCreditSettings();
    if (settings.error) throw new Error(settings.error.message);
    return settings.data.welcomeCreditCents;
  },
  ["marketing-welcome-credit-v1"],
  { revalidate: 60 * 60 },
);

/** The sign-up credit in cents; null when it's off (0) or can't be read. */
export async function getWelcomeCredit(): Promise<number | null> {
  try {
    const cents = await cachedWelcomeCredit();
    return cents > 0 ? cents : null;
  } catch (e) {
    log("warn", "Welcome credit unavailable", { error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

// The print-at-home PDF's list price, read the same way checkout reads it (chargeableCents).
const cachedDigitalPrice = unstable_cache(
  async (): Promise<number> => {
    const price = await chargeableCents("book.digital");
    if (price.error) throw new Error(price.error.message);
    return price.data;
  },
  ["marketing-digital-price-v1"],
  { revalidate: DAY_SECONDS },
);

/** What a print-at-home PDF of a whole book costs, in cents; null if unknown or free. */
export async function getDigitalBookPrice(): Promise<number | null> {
  try {
    const cents = await cachedDigitalPrice();
    return cents > 0 ? cents : null;
  } catch (e) {
    log("warn", "Digital book price unavailable", { error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

// What one new coloring page charges an account's credit, read the way checkout reads prices.
const cachedPagePrice = unstable_cache(
  async (): Promise<number> => {
    const price = await chargeableCents("ai.sheet_generation");
    if (price.error) throw new Error(price.error.message);
    return price.data;
  },
  ["marketing-page-price-v1"],
  { revalidate: DAY_SECONDS },
);

/** What a new coloring page costs an account, in cents; null if unknown or free. */
export async function getPagePrice(): Promise<number | null> {
  try {
    const cents = await cachedPagePrice();
    return cents > 0 ? cents : null;
  } catch (e) {
    log("warn", "Page price unavailable", { error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

export type MarketingNumbers = NumbersInput;

export async function getMarketingNumbers(): Promise<MarketingNumbers> {
  const [referencePriceCents, welcomeCreditCents, digitalPriceCents, pagePriceCents] = await Promise.all([
    getReferencePrice(),
    getWelcomeCredit(),
    getDigitalBookPrice(),
    getPagePrice(),
  ]);
  return {
    referencePriceCents,
    welcomeCreditCents,
    digitalPriceCents,
    pagePriceCents,
    // The example behind "{price}": the same book REFERENCE_BOOK prices.
    referencePages: REFERENCE_BOOK.pageCount,
    referenceFormat: BOOK_BINDINGS[REFERENCE_BOOK.bindingId].shortLabel.toLowerCase(),
  };
}
