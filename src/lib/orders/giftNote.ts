/** Longest gift note, in characters, the book will print. */
export const GIFT_NOTE_MAX_CHARS = 200;

/** Most line breaks a note keeps, so it always fits on its page. */
const GIFT_NOTE_MAX_LINES = 8;

/**
 * Characters the note page's font can print beyond Latin-1 (the rest of the
 * Windows-1252 set). Anything else, emoji included, is left out of the note
 * so the preview shows exactly what prints.
 */
const EXTRA_PRINTABLE = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

function printable(ch: string): boolean {
  const code = ch.codePointAt(0)!;
  return (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || EXTRA_PRINTABLE.has(ch);
}

/** Drop characters that can't print, keeping line breaks; does not trim, so typing feels normal. */
export function printableGiftNoteChars(text: string): string {
  return Array.from(text.replace(/\r\n?/g, "\n"))
    .filter((ch) => ch === "\n" || printable(ch))
    .join("")
    .slice(0, GIFT_NOTE_MAX_CHARS);
}

/** The note as it is stored and printed: printable, trimmed, at most a few lines, within the limit. Empty means no note. */
export function normalizeGiftNote(text: unknown): string {
  if (typeof text !== "string") return "";
  const lines = printableGiftNoteChars(text)
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd());
  const kept = lines.slice(0, GIFT_NOTE_MAX_LINES).join("\n");
  return kept.replace(/\n{3,}/g, "\n\n").trim().slice(0, GIFT_NOTE_MAX_CHARS);
}
