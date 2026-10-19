/**
 * The seasonal card on the signed-in home screen. Edit here to change or retire it.
 *
 * `NEXT_PUBLIC_SEASONAL_PROMPT_UNTIL` overrides `until` without a code change: a date
 * (YYYY-MM-DD, last day shown) or "off" to hide the card.
 */
export type SeasonalPromptConfig = {
  id: "year-book";
  /** {year} becomes the current calendar year. */
  title: string;
  body: string;
  cta: string;
  /** Name given to the new album. */
  albumName: string;
  /** Last day the card shows (inclusive, the visitor's local date), YYYY-MM-DD. */
  until: string;
};

export const SEASONAL_PROMPT: SeasonalPromptConfig | null = {
  id: "year-book",
  title: "Make a book of this year",
  body: "Gather the photos you added in {year} into one album, then turn them into a coloring book in time for the holidays.",
  cta: "Start my {year} album",
  albumName: "Our {year}",
  until: "2026-12-07",
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function localDateKey(now: Date): string {
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

/** The prompt to show today with {year} filled in, or null when it's off or over. */
export function activeSeasonalPrompt(now = new Date()): (SeasonalPromptConfig & { year: number }) | null {
  if (!SEASONAL_PROMPT) return null;
  const override = process.env.NEXT_PUBLIC_SEASONAL_PROMPT_UNTIL?.trim();
  if (override === "off") return null;
  const until = override && DATE_PATTERN.test(override) ? override : SEASONAL_PROMPT.until;
  if (localDateKey(now) > until) return null;
  const year = now.getFullYear();
  const fill = (text: string) => text.replaceAll("{year}", String(year));
  return {
    ...SEASONAL_PROMPT,
    title: fill(SEASONAL_PROMPT.title),
    body: fill(SEASONAL_PROMPT.body),
    cta: fill(SEASONAL_PROMPT.cta),
    albumName: fill(SEASONAL_PROMPT.albumName),
    until,
    year,
  };
}
