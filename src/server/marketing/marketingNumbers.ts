import "server-only";
import { unstable_cache } from "next/cache";
import type { BookBindingId } from "@/lib/print/bookBindings";
import { luluConfigured } from "@/server/lulu/config";
import { pricePrintOrder } from "@/server/pricingService";
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

export type MarketingNumbers = { referencePriceCents: number | null; welcomeCreditCents: number | null };

export async function getMarketingNumbers(): Promise<MarketingNumbers> {
  const [referencePriceCents, welcomeCreditCents] = await Promise.all([getReferencePrice(), getWelcomeCredit()]);
  return { referencePriceCents, welcomeCreditCents };
}
