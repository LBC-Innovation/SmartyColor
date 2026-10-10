import { photoLayoutPromptBlock, type PhotoLayout } from "@/lib/photo/orientation";
import { describePrintPrefsForAI, type PrintPrefs } from "@/lib/print/settings";
import type { RefineRequest } from "@/lib/session/types";

export const REFINE_SYSTEM_PROMPT = `You help elementary-aged kids turn an idea into a printable coloring sheet.

Voice:
- Short, warm, simple sentences a 7-year-old can read.
- Never sound like a lawyer or a teacher giving a lecture.
- Never mention being an AI model, safety filters, or copyright law by name.

Hard rules:
1. Violence, gore, weapons used to hurt people, hate, sexual content, nudity, and other adult themes are not allowed. If the idea includes those, set kind to "blocked". Speak kindly. Offer a safer, still-fun coloring idea in saferIdea and kidMessage. Do not lecture.
2. Famous characters / brands: stay AS CLOSE as possible to what the kid asked for. Prefer kind "ok" and describe the look in plain visual words (costume, colors-as-coloring-hints, pose, gear, sidekick, setting) without needing the official name in the drawing plan. Only use kind "workaround" when you must avoid an exact trademarked name or logo — and even then, the plan must be a near look-alike the kid would instantly recognize as "the same character vibe," not a totally different hero. Keep the same body type, outfit shape, signature gear, pose, and scene. Tiny original tweaks only (no logos, no brand text). Never refuse or say you can't draw it. Put any owned name only in workaround.originalIntent.
3. If the idea is fine (including near look-alikes described without brand names), set kind to "ok".
4. Points must be concrete drawing choices about the SCENE only (who, what they are doing, setting, how busy the page is). For inspired characters, points should lock in the recognizable visual details.
5. When the kid mentions a color, keep it as a "kid can color this ___ " note in a point — never as something already painted on the page. The sheet itself is always blank outlines.
6. Honor the likes list. Do not drop things the kid already loved unless they asked to change them. Do not re-add items the kid removed from the plan.
7. Printer Settings are authoritative for title, decorative border, and name line. NEVER invent plan points about a title, fun border, frame, name line, paper size, or orientation. Do not suggest those options in points or kidMessage. Follow the Print setup flags exactly; if something is OFF, do not mention it as something we will draw.

Return only the structured object.`;

const COLOR_WORD =
  /\b(?:red|green|blue|yellow|orange|purple|pink|brown|black|white|gray|grey|gold|golden|silver|teal|cyan|magenta|violet|indigo|maroon|beige|tan|navy|lime|turquoise|aqua|coral|crimson|scarlet|lavender|olive|peach|rose|amber|ivory|charcoal|rainbow-colored|rainbow)\b/gi;

const PRINT_OPTION_POINT =
  /\b(title|headline|caption|fun border|decorative border|border around|page border|frame around|name line|signature line|write (?:a |the )?title)\b/i;

/** Subject text for the image model: strip color adjectives so it does not paint them. */
export function neutralizeColorWords(text: string) {
  return text
    .replace(COLOR_WORD, "")
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
  const likes = input.likes.length
    ? input.likes.map((like) => `- ${like.text}`).join("\n")
    : "(none yet)";
  const previous = input.session?.lastFeedback
    ? JSON.stringify(input.session.lastFeedback, null, 2)
    : "(first turn)";

  return `Kid idea: ${input.idea}

Print setup (follow exactly; do not invent extra page chrome):
${describePrintPrefsForAI(input.printPrefs)}

Things the kid already loves (the live plan — do not re-add removed items):
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

  return `OUTPUT FORMAT (non-negotiable):
This must be a blank coloring-book page: pure black (#000000) outlines only on a pure white (#FFFFFF) background.
ZERO color. ZERO gray fill. ZERO shading. ZERO gradients. ZERO tinted ink.
Every interior of every shape stays empty white so a child can color it in with crayons.

If any word in the request suggests a color (green, red, blue, etc.), that word is a FUTURE coloring hint for the child — never paint, ink, or fill it.

${colorNotes}

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

function coloringSheetOutputRules(printPrefs: PrintPrefs, title: string) {
  const prefs = printPrefs;
  const titleBlock = prefs.showTitle
    ? `Title: draw short black outline letters that say "${title}".`
    : `Title: draw NO title text, NO headline, NO caption anywhere on the page.`;
  const borderBlock = prefs.funBorder
    ? `Border: include a fun decorative border/frame around the page.`
    : `Border: draw NO decorative border, frame, double page outline, or edge ornament. Plain white margin only.`;
  const nameBlock = prefs.nameLine
    ? `Name line: include a blank line for a name near the bottom.`
    : `Name line: draw NO name line or "Name: ___".`;

  return `OUTPUT FORMAT (non-negotiable):
This must be a blank coloring-book page: pure black (#000000) outlines only on a pure white (#FFFFFF) background.
ZERO color. ZERO gray fill. ZERO shading. ZERO gradients. ZERO tinted ink.
Every interior of every shape stays empty white so a child can color it in with crayons.

PAGE CHROME (Printer Settings — override any conflicting wording):
${titleBlock}
${borderBlock}
${nameBlock}
Orientation/detail: ${prefs.orientation}, ${prefs.detail} details.

Style:
- Classic printable coloring sheet / color-in page
- Clean closed shapes, thick outer contours, simpler inner details unless detail level says busy
- Friendly, age-appropriate
- No photorealism, textures, or filled regions — only outlines
- No watermarks, signatures, or UI chrome
- No violence, weapons-as-harm, scary gore, or adult content`;
}

function photoLineArtStyleRules() {
  return `Line art quality (required for photo tracing):
- Match a store-bought coloring book: smooth, even, connected black outlines on white paper only.
- Outer silhouettes: light-to-medium line weight — never bold marker, never heavy black fills.
- Eyes, brows, lips, fingers: thin delicate strokes — not thick blobs or square blocks.
- Strokes must be smooth flowing curves — no jagged pixels, stair-steps, or sketchy dashes.
- SOLID continuous lines only — no dotted, broken, or stippled segments.
- NO cross-hatching, NO gray shading, NO horizontal/vertical hatch lines, NO random scribbles in blank areas.
- Background trees/foliage: simplify to a few smooth outline shapes — do NOT draw every leaf or branch.
- Only draw outlines for subjects and large shapes the kid would color — not photo edge-detection noise.
- Every large area inside a shape must stay EMPTY WHITE for coloring — never fill clothing, sky, skin, or backgrounds with solid black.
- NEVER use solid black fills anywhere on the page — not for shadows, shirts, hair masses, or compression blocks. Outlines only; all interiors white.
- If a region would become a solid black shape, leave it white instead.
- Dark photo areas (night sky, black face masks, dark clothing) must still be EMPTY WHITE on the coloring page — trace only the outer edges, never paint those areas solid black.`;
}

export function buildPhotoColoringPrompt(
  printPrefs: PrintPrefs,
  layout: PhotoLayout,
) {
  const title = printPrefs.showTitle ? "My photo coloring page" : "Coloring sheet";
  const prefs = { ...printPrefs, orientation: layout.orientation };

  return `You are turning a REAL photograph into a printable coloring sheet.

${photoLayoutPromptBlock(layout)}

Faithfulness (most important):
- Match the photo's subjects, composition, poses, proportions, and layout as closely as a coloring page allows.
- Do NOT invent new characters, objects, backgrounds, or story elements that are not in the photo.
- Do NOT cartoonify into a different scene. Stay true to what is actually visible.
- Preserve relative sizes and positions of people, pets, objects, and scenery from the photo.
- If something is unclear in the photo, simplify with honest outline shapes — do not guess wildly.

${photoLineArtStyleRules()}

${coloringSheetOutputRules(prefs, title)}

Draw the photo as empty line art a kid can color.`;
}

export function buildPhotoCorrectionPrompt(
  printPrefs: PrintPrefs,
  corrections: string[],
  layout: PhotoLayout,
) {
  const title = printPrefs.showTitle ? "My photo coloring page" : "Coloring sheet";
  const prefs = { ...printPrefs, orientation: layout.orientation };
  const list = corrections.map((line, i) => `${i + 1}. ${line}`).join("\n");

  return `You are fixing a photo-based coloring sheet.

${photoLayoutPromptBlock(layout)}

You receive:
1) The ORIGINAL photograph (ground truth).
2) The PREVIOUS coloring attempt (what to improve).

Fix ONLY the issues listed below. Keep everything else the same as the previous attempt unless a fix requires a small adjustment nearby.
Treat each issue as a surgical edit: change only what that note describes; preserve all other lines, shapes, and composition from the PREVIOUS coloring attempt.

Line weight (critical):
- Match the PREVIOUS coloring attempt exactly: same stroke thickness and boldness as that sheet — not thinner, not thicker.
- Output one complete replacement coloring-sheet image (full canvas). Do not overlay or trace on top of the previous sheet reference.
- Do NOT retrace, duplicate, or stack a second line on an edge that already exists (that makes lines bolder).
- Do NOT simplify, fade, or hairline-ify strokes that already exist (that makes lines thinner).

Do NOT redesign the whole page. Do NOT add fictional elements. Stay faithful to the photograph.

Issues to fix:
${list}

${photoLineArtStyleRules()}

${coloringSheetOutputRules(prefs, title)}

Return an improved coloring sheet that addresses the issues while staying true to the photo.`;
}
