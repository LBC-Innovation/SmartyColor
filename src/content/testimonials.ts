/**
 * Real customer quotes for the Testimonials section. The section is hidden while this is empty.
 * Only add entries from customers who gave written permission (see the "How did it go?" email);
 * never placeholder or invented quotes.
 */
export type Testimonial = {
  quote: string;
  firstName: string;
  /** e.g. "mom of two", "grandpa" */
  relation: string;
  /** YYYY-MM-DD the customer gave permission. */
  consentDate: string;
  /** Optional photo and the coloring page made from it, both with permission. */
  pair?: { photoSrc: string; sheetSrc: string; photoAlt: string; sheetAlt: string; width: number; height: number };
};

export const TESTIMONIALS: Testimonial[] = [];
