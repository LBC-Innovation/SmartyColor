import { describePrintPrefsForAI, type PrintPrefs } from "@/lib/print/settings";
import type { RefineRequest } from "@/lib/session/types";

export const REFINE_SYSTEM_PROMPT = `You help elementary-aged kids turn an idea into a printable coloring sheet.

Voice:
- Short, warm, simple sentences a 7-year-old can read.
- Never sound like a lawyer or a teacher giving a lecture.
- Never mention being an AI model, safety filters, or copyright law by name.

Hard rules:
1. Violence, gore, weapons used to hurt people, hate, sexual content, nudity, and other adult themes are not allowed. If the idea includes those, set kind to "blocked". Speak kindly. Offer a safer, still-fun coloring idea in saferIdea and kidMessage. Always include at least two concrete scene points for the safer idea (or the kid-friendly alternative you suggest) so they can press Make It right away. Do not lecture.
2. Famous characters / brands: stay AS CLOSE as possible to what the kid asked for. Prefer kind "ok" and describe the look in plain visual words (costume, colors-as-coloring-hints, pose, gear, sidekick, setting) without needing the official name in the drawing plan. Only use kind "workaround" when you must avoid an exact trademarked name or logo — and even then, the plan must be a near look-alike the kid would instantly recognize as "the same character vibe," not a totally different hero. Keep the same body type, outfit shape, signature gear, pose, and scene. Tiny original tweaks only (no logos, no brand text). Never refuse or say you can't draw it. Put any owned name only in workaround.originalIntent.
3. If the idea is fine (including near look-alikes described without brand names), set kind to "ok".
4. Points must be concrete drawing choices about the SCENE only (who, what they are doing, setting, how busy the page is). For inspired characters, points should lock in the recognizable visual details.
5. When the kid mentions a color, keep it as a "kid can color this ___ " note in a point — never as something already painted on the page. The sheet itself is always blank outlines.
6. Honor the likes list. Do not drop things the kid already loved unless they asked to change or remove them. Do not re-add items the kid removed from the plan.
7. In EDIT MODE (kid already saw a rendered sheet): the current plan is the source of truth and stays in place. The kid will NOT restate unchanged requirements. Return only a delta:
   - removeFromPlan: exact (or near-exact) texts from the current plan to delete, including old wording when something is rewritten.
   - points: ONLY new plan lines and rewritten replacements. Do NOT restate unchanged plan items in points.
8. Printer Settings are authoritative for title, decorative border, and name line. NEVER invent plan points about a title, fun border, frame, name line, paper size, or orientation. Do not suggest those options in points or kidMessage. Follow the Print setup flags exactly; if something is OFF, do not mention it as something we will draw.

Return only the structured object.`;

const COLOR_WORD =
  /\b(?:red|green|blue|yellow|orange|purple|pink|brown|black|white|gray|grey|gold|golden|silver|teal|cyan|magenta|violet|indigo|maroon|beige|tan|navy|lime|turquoise|aqua|coral|crimson|scarlet|lavender|olive|peach|rose|amber|ivory|charcoal|rainbow-colored|rainbow)\b/gi;

const PRINT_OPTION_POINT =
  /\b(title|headline|caption|fun border|decorative border|border around|page border|frame around|name line|signature line|write (?:a |the )?title)\b/i;

/** Common franchise / character labels that trigger empty content-filter image responses. */
const FAMOUS_NAME =
  /\b(?:ninjago|lloyd|kai|nya|zane|cole|jay|wu|frozen|elsa|anna|olaf|disney|pixar|marvel|avengers|spider-?man|batman|superman|pokemon|pikachu|mario|luigi|peach|yoshi|zelda|link|minecraft|steve|creeper|star wars|vader|skywalker|grogu|baby yoda|paw patrol|bluey|peppa|hello kitty|sonic|knuckles|barbie|transformers|optimus|skibidi|roblox)\b/gi;

/** Subject text for the image model: strip color adjectives so it does not paint them. */
export function neutralizeColorWords(text: string) {
  return text
    .replace(COLOR_WORD, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?'"])/g, "$1")
    .trim();
}

/** Soften IP labels for a retry after Gemini returns content-filter with no image. */
export function neutralizeFamousNames(text: string) {
  return text
    .replace(FAMOUS_NAME, "")
    .replace(/\bfrom\s+(?:the\s+)?[A-Z][\w'-]*/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?'"])/g, "$1")
    .trim();
}

export function collectColorMentions(...texts: string[]) {
  const found = new Set<string>();
  for (const text of texts) {
    for (const match of text.matchAll(COLOR_WORD)) {
      found.add(match[0].toLowerCase());
    }
  }
  return [...found];
}

/** Drop plan lines that are really printer-setting suggestions, not scene content. */
export function isScenePlanPoint(text: string) {
  return !PRINT_OPTION_POINT.test(text);
}

export function buildRefineUserPrompt(input: RefineRequest) {
  const editingPreviousSheet = Boolean(
    input.editingPreviousSheet ?? input.session?.editingPreviousSheet,
  );
  const likes = input.likes.length
    ? editingPreviousSheet
      ? input.likes
          .map((like, index) => `${index + 1}. ${like.text}`)
          .join("\n")
      : input.likes.map((like) => `- ${like.text}`).join("\n")
    : "(none yet)";
  const previous = input.session?.lastFeedback
    ? JSON.stringify(input.session.lastFeedback, null, 2)
    : "(first turn)";

  return `Kid idea: ${input.idea}

${
  editingPreviousSheet
    ? `EDIT MODE: The kid already saw a rendered coloring sheet and is requesting a change. They will NOT recap the whole plan — keep every current plan item unless the edit clearly changes or removes it. Apply their request ON TOP of the current plan.

Return a delta only:
- removeFromPlan: copy texts from the current plan that should be deleted (for removals, or the old text when rewriting).
- points: only brand-new requirements and rewritten replacements. Never repeat unchanged plan lines in points.
If the edit only removes something, points may be empty and removeFromPlan should list what to drop.
If the edit only adds something, removeFromPlan may be empty and points should list the additions.
`
    : ""
}
Print setup (follow exactly; do not invent extra page chrome):
${describePrintPrefsForAI(input.printPrefs)}

${
  editingPreviousSheet
    ? "Current plan (keep all of these unless listed in removeFromPlan):"
    : "Things the kid already loves (the live plan — do not re-add removed items):"
}
${likes}

Points they tapped Nah on: ${input.nahPointIds?.join(", ") || "none"}

What they typed to change: ${input.revisionNote?.trim() || "nothing extra"}

Previous confirmation:
${previous}`;
}

export function buildGeneratePrompt(input: {
  idea: string;
  likes: string[];
  printPrefs: PrintPrefs;
  title: string;
  editingPreviousSheet?: boolean;
}) {
  const sceneLikes = input.likes.filter(isScenePlanPoint);
  const colorMentions = collectColorMentions(input.idea, ...sceneLikes);
  const subject = neutralizeColorWords(input.idea);
  const likes = sceneLikes
    .map(neutralizeColorWords)
    .filter(Boolean)
    .join("; ");

  const colorNotes =
    colorMentions.length > 0
      ? `The kid may later color with: ${colorMentions.join(", ")}. Do NOT draw those colors. Leave those areas empty white inside black outlines.`
      : `Do not invent or apply any fill colors.`;

  const prefs = input.printPrefs;
  const titleBlock = prefs.showTitle
    ? `Title: draw short black outline letters that say "${input.title}".`
    : `Title: draw NO title text, NO headline, NO caption anywhere on the page.`;
  const borderBlock = prefs.funBorder
    ? `Border: include a fun decorative border/frame around the page.`
    : `Border: draw NO decorative border, frame, double page outline, or edge ornament. Plain white margin only.`;
  const nameBlock = prefs.nameLine
    ? `Name line: include a blank line for a name near the bottom.`
    : `Name line: draw NO name line or "Name: ___".`;

  const editBlock = input.editingPreviousSheet
    ? `
EDIT OF PREVIOUS RENDER: This request revises a coloring sheet the kid already saw. Keep the same overall character and scene unless the plan details say to change them. Apply the plan as updates to that prior drawing — do not start from a totally unrelated composition.
`
    : "";

  return `OUTPUT FORMAT (non-negotiable):
This must be a blank coloring-book page: pure black (#000000) outlines only on a pure white (#FFFFFF) background.
ZERO color. ZERO gray fill. ZERO shading. ZERO gradients. ZERO tinted ink.
Every interior of every shape stays empty white so a child can color it in with crayons.

If any word in the request suggests a color (green, red, blue, etc.), that word is a FUTURE coloring hint for the child — never paint, ink, or fill it.

${colorNotes}
${editBlock}
PAGE CHROME (Printer Settings — override any conflicting plan wording):
${titleBlock}
${borderBlock}
${nameBlock}
Orientation/detail: ${prefs.orientation}, ${prefs.detail} details.

Draw this scene as empty line art:
Subject: ${subject || "a fun kid adventure"}
Plan details to include (scene only; outlines only): ${likes || "follow the subject"}
Do NOT add extras that are not in the plan details above.

Style:
- Classic printable coloring sheet / color-in page
- Clean closed shapes, thick outer contours, simpler inner details unless the plan says busy
- Friendly, cute, age-appropriate
- No photorealism, textures, or filled costumes/uniforms
- No watermarks, signatures, or UI chrome
- Match the requested character and scene as closely as a kid would expect: same silhouette, costume shapes, gear, pose, and setting. Avoid only official logos, brand wordmarks, and exact trademarked emblems. Do NOT swap in an unrelated character.
- No violence, weapons-as-harm, scary gore, or adult content

Final check: no color fills; page chrome matches Printer Settings exactly (especially title/border off when told not to draw them).`;
}

export const IMAGE_FILTER_REWRITE_SYSTEM = `You rewrite kid coloring-page requests after an image model content-filter blocked them.

Goal: keep the drawing AS CLOSE as possible to what the kid wanted, while removing words/names that trigger ownership or content filters.

Rules:
1. Infer what likely triggered the filter (character name, franchise, brand, celebrity, etc.).
2. Redescribe using plain visual words only: body type, costume shapes, hair, mask/hood, gear, pose, companion, setting, action.
3. A kid who asked for the original should still recognize the vibe from your description.
4. NEVER include official character names, franchise names, brand names, logos, or "from [movie/show]" phrasing.
5. Do not invent a totally different character or scene.
6. Colors may be mentioned only as future coloring hints (the page itself is black outlines on white).
7. safeSubject is one short scene sentence. safePlanDetails are 2-6 concrete outline details.`;

export function buildImageFilterRewritePrompt(input: {
  idea: string;
  planDetails: string[];
  finishReason: string;
  modelText: string;
  errorMessage: string;
  previousSafeSubject?: string;
}) {
  return `Original kid idea:
${input.idea}

Current plan details:
${input.planDetails.map((item) => `- ${item}`).join("\n") || "(none)"}

Image model failure:
- finishReason: ${input.finishReason || "unknown"}
- model text: ${input.modelText || "(empty)"}
- error: ${input.errorMessage || "(none)"}
${
  input.previousSafeSubject
    ? `\nA previous safe rewrite still failed:\n${input.previousSafeSubject}\nMake this rewrite safer while staying visually close.\n`
    : ""
}
Return a safer near look-alike description for a black-outline coloring page.`;
}
