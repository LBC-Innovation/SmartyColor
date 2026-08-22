/** @format */

export const SMARTY_GREETING =
  "What do you want to color today? Tell me your idea!";

export const HOW_TO_USE_SECTIONS = [
  "Describe it",
  "Review it",
  "Make it",
  "Replace it",
] as const;

export const HOW_TO_USE_GUIDE = `Describe it
• Type or speak in the chat! Tell me what you want to color, like a dinosaur, a castle, or your favorite hero.

Review it
• I'll turn your chat into drawing requirements in the panel beside the chat. Tap the pencil to edit any line, or the trash can to remove it.

Make it
• When the plan looks right, press "Make It!" in the panel and I'll create your printable coloring sheet.

Replace it
• Not happy with the drawing? Keep chatting! I'll update these requirements from your feedback and try again. For famous characters, I'll do my best to match what you asked for, but may swap in a close look-alike when needed (Called Copy Right Protection).`;

/** First Smarty chat message: greeting plus static how-to copy (no LLM tokens). */
export function buildFirstSmartyMessage() {
  return `${SMARTY_GREETING}\n\n${HOW_TO_USE_GUIDE}`;
}

export const howToUseSectionPattern = new RegExp(
  `(${HOW_TO_USE_SECTIONS.join("|")})`,
  "g",
);

export const howToUseSectionSet = new Set<string>(HOW_TO_USE_SECTIONS);
