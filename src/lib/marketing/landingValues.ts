import { CONTACT_EMAIL, FAQ, LANDING_PAGES, type FaqEntry, type LandingIntent } from "@/content/marketing";
import { fillCopy, numberValues, type CopyValues, type NumbersInput } from "@/lib/marketing/copy";
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

export type LandingFaqItem = { q: string; a: string; link?: FaqEntry["link"] };

/** A page's questions, own first then the shared ones it picks, with tokens filled and unfillable ones hidden. */
export function landingFaq(intent: LandingIntent, values: CopyValues): LandingFaqItem[] {
  const page = LANDING_PAGES[intent];
  const common = page.commonFaq
    ? page.commonFaq.map((id) => FAQ.items.find((f) => f.id === id)).filter((f): f is (typeof FAQ.items)[number] => Boolean(f))
    : FAQ.items;
  return [...page.faq, ...common]
    .map(({ q, a, fallback, link }) => ({
      q,
      a: fillCopy(a, values) ?? (fallback ? fillCopy(fallback, values) : null),
      link,
    }))
    .filter((e): e is { q: string; a: string; link: FaqEntry["link"] } => e.a != null);
}
