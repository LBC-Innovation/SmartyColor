import { CONTACT_EMAIL, FAQ, LANDING_PAGES, type FaqEntry, type LandingIntent } from "@/content/marketing";
import { fillCopy, hasPackages, numberValues, type CopyValues, type NumbersInput } from "@/lib/marketing/copy";
import { smallestPrintedBinding } from "@/lib/marketing/smallestBook";

/** Every copy token a landing page can fill, from the server's numbers and the holiday date. */
export function landingValues(numbers: NumbersInput | null, holidayLabel: string | null): CopyValues {
  const smallest = smallestPrintedBinding();
  return {
    ...numberValues(numbers),
    date: holidayLabel,
    email: CONTACT_EMAIL,
    min: String(smallest.minPages),
    format: smallest.shortLabel.toLowerCase(),
  };
}

/**
 * True when this page should lead with the book: it has a book-first layout and at least one
 * package is on sale. Otherwise the page shows its free-try layout, which is complete on its own.
 */
export function isBookFirst(intent: LandingIntent, numbers: NumbersInput | null): boolean {
  return Boolean(LANDING_PAGES[intent].bookFirst) && hasPackages(numbers);
}

export type LandingFaqItem = { q: string; a: string; link?: FaqEntry["link"] };

/** A page's questions, own first then the shared ones it picks, with tokens filled and unfillable ones hidden. */
export function landingFaq(intent: LandingIntent, values: CopyValues, bookFirst = false): LandingFaqItem[] {
  const page = LANDING_PAGES[intent];
  const own = bookFirst && page.bookFirst ? page.bookFirst.faq : page.faq;
  const ids = bookFirst && page.bookFirst ? page.bookFirst.commonFaq : page.commonFaq;
  const common = ids
    ? ids.map((id) => FAQ.items.find((f) => f.id === id)).filter((f): f is (typeof FAQ.items)[number] => Boolean(f))
    : FAQ.items;
  return [...own, ...common]
    .map(({ q, a, fallback, link }) => ({
      q,
      a: fillCopy(a, values) ?? (fallback ? fillCopy(fallback, values) : null),
      link,
    }))
    .filter((e): e is { q: string; a: string; link: FaqEntry["link"] } => e.a != null);
}
