/**
 * Design themes: an album-wide "world" ("we're all superheroes saving the city") that every new
 * coloring page made from a photo in that album is drawn in. The text is typed by the customer, so
 * it is untrusted: it is cleaned here, quoted as data in the prompt, and never sent to analytics.
 */

export const DESIGN_THEME_MAX_CHARS = 200;

/**
 * Trim, collapse whitespace, strip control and invisible characters, and cap the length.
 * Returns null when nothing is left (no theme).
 */
export function sanitizeDesignTheme(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    // Control characters, then the zero-width and bidi override characters used to hide text.
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ")
    .replace(/[​-‏‪-‮⁠-⁤﻿]/g, "")
    // Quote marks would let the text close the quoted "theme" line in the prompt.
    .replace(/["“”]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, DESIGN_THEME_MAX_CHARS)
    .trim();
  return cleaned || null;
}

/** Words that never belong in a family coloring book. A blunt first filter; the prompt also says so. */
const NOT_FAMILY_FRIENDLY =
  /\b(?:nude|naked|nudity|porn\w*|sex(?:y|ual)?|erotic|fetish|gore|gory|bloody|blood\s*bath|massacre|murder\w*|kill(?:ing|ed|er|s)?|torture\w*|suicide|rape|terroris\w+|genocide|nazi\w*|swastika|drugs?|cocaine|heroin|meth|lynch\w*|decapitat\w*|dismember\w*)\b/i;

export const THEME_NOT_ALLOWED_CODE = "THEME_NOT_ALLOWED";
export const THEME_TOO_LONG_CODE = "THEME_TOO_LONG";

/**
 * Validate a theme from the client: null or empty means "no theme". Returns the clean text, or an
 * error with a friendly message and a code the UI maps to its own copy.
 */
export function checkDesignTheme(
  raw: unknown,
): { data: string | null; error: null } | { data: null; error: { message: string; code: string } } {
  if (raw === null || raw === undefined) return { data: null, error: null };
  if (typeof raw !== "string") {
    return { data: null, error: { message: "That theme isn't text.", code: "INVALID_INPUT" } };
  }
  if (raw.trim().length > DESIGN_THEME_MAX_CHARS) {
    return { data: null, error: { message: "Please keep it under 200 characters.", code: THEME_TOO_LONG_CODE } };
  }
  const clean = sanitizeDesignTheme(raw);
  if (clean && NOT_FAMILY_FRIENDLY.test(clean)) {
    return {
      data: null,
      error: {
        message: "That theme won't work for a family coloring book. Try something like “Under the sea” or “Space explorers”.",
        code: THEME_NOT_ALLOWED_CODE,
      },
    };
  }
  return { data: clean, error: null };
}
