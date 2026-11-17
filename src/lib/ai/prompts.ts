import {
  letterCanvas,
  letterCanvasFor,
  photoLayoutPromptBlock,
  printPagePromptBlock,
  type PhotoLayout,
} from "@/lib/photo/orientation";
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

  return `${printPagePromptBlock(letterCanvas(prefs.orientation))}

OUTPUT FORMAT (non-negotiable):
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

Final check: no color fills; the canvas is the US Letter page shape, filled edge to edge; page chrome matches Printer Settings exactly (especially title/border off when told not to draw them).`;
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
- The finished page must look like a page from a professionally published coloring book: confident, smooth, clean ink lines, as if inked with a fine technical pen or drawn as vector art. Realistic proportions and shapes from the photo, drawn with calm, simplified, polished linework.
- ONE clean stroke per edge. No sketchy, feathered, doubled, overlapping, wobbly, broken, or scratchy lines. No pencil or charcoal look. No texture strokes.
- Smooth flowing curves with clean joins — no jagged pixels, stair-steps, kinks, or tiny zig-zags.
- Even line weight: outer silhouettes medium weight; interior details a little thinner. Never hairline-thin, never bold marker.
- Every line is solid, fully black ink — never gray, pale, or faint. The page is cleaned up for print and any line too light or thin to see clearly is erased, so small details (noses, eyelids, fingers) must be as dark as the outlines.
- SOLID continuous lines only — no dotted, dashed, or stippled lines anywhere, and no dots used as texture.
- NO cross-hatching, NO hatch lines, NO gray shading, NO shadow marks, NO random scribbles in blank areas.
- Draw only the outlines a child would color between — not photo edge-detection noise, not every crease and fold. Simplify small clutter into a few clear shapes.
- Background trees/foliage: a few smooth outline shapes — do NOT draw every leaf or branch.

Hair (common mistake: frizzy, strand-by-strand hair — never do this):
- Draw hair as ONE smooth outer outline of the hairstyle plus only a few (about 3 to 8) long, smooth flowing lines that follow its main sections or locks.
- Keep the real style from the photo: straight hair stays sleek and straight, wavy hair gets a few soft waves, curly hair gets a handful of rounded curl shapes along its edge.
- NO individual strands, NO flyaway hairs, NO fuzzy, frizzy, spiky, or jagged hair edges, NO scribbled hair texture. Most of the hair area stays EMPTY WHITE for coloring.
- Eyebrows: one soft smooth shape each — not many little hair strokes.
- Beards, mustaches, and stubble: ONE smooth closed outline shape, left white inside (at most one soft inner line) — never stubble dots, stipple, short tick marks, or strand texture.
- A mustache is a single smooth, closed shape like a soft rounded band above the lip — its edge is one clean line, never fringed, and its inside is completely EMPTY WHITE with no hair strokes.
- Bangs and fringe: a smooth, softly curved lower edge — not a row of pointed or spiky tips.

Clothing patterns (common mistake: dense, scratchy plaid or gingham — never do this):
- Plaid, gingham, checks, and stripes: a FEW evenly spaced, clean straight lines (about 4 to 8 across a shirt front), making boxes or bands big enough for a child to color. Lines follow the fabric's folds smoothly and stop cleanly at seams.
- NO dense grids, NO doubled or broken pattern lines, NO tiny checks, NO hatching to suggest a weave.
- Small prints (polka dots, flowers): a modest number of clean, open shapes with white insides — never tiny solid dots.
- Plain fabric stays plain: a solid or heathered (speckled, marled) shirt gets only its outline, seams, and a few folds — no dots, prints, or texture. Draw a pattern ONLY where the photo clearly shows one.
- When there is a pattern, keep its REAL motif: dots stay small round open circles, stripes stay stripes, checks stay checks, flowers stay flowers. Never swap in a different motif (hearts, stars, animals).
- Keep garment details as they are: do not add pockets, logos, buttons, or trims the photo doesn't show; a printed logo is a simple outline shape in the same place.
- Clothing folds: only a few main fold lines, not every wrinkle.

Faces and eyes (common mistake: dramatic, oversized, heavily lined eyes — never do this):
- Keep every face true to the photo and easy to recognize, with natural, relaxed features. Do not exaggerate, beautify, glamorize, or stylize.
- Every visible face gets eyes (unless sunglasses hide them), a nose, and a mouth — however small the face is in a wide shot. Draw small faces simpler, never with a feature left out.
- Eyes (only where the eyes are actually visible in the photo — see Eyewear below): keep the photo's real eye size and shape — never enlarge them. A simple eye outline, a round iris, a small solid pupil dot with a little white highlight, and at most one thin lid line above.
- NO eyeliner, NO thick or long eyelashes, NO individual lashes, NO dark or filled irises, NO anime, cartoon, doll, or makeup look.
- Nose: always drawn, as one clearly visible solid black stroke: a short line for the side of the nose joined to a small curve under the tip for the nostrils, in the same black ink and weight as the mouth. Not a heavy full outline, and never faint, dotted, or left out.
- Mouth: a simple, clean lip outline. Teeth as one smooth shape with only a few light divisions.
- Clean skin: NO wrinkles, pores, freckles, under-eye bags, cheek creases, or shading marks. A smile line only where it is strongly visible in the photo.
- Hands and fingers: clean, simple outlines.

Eyewear (common mistake: turning sunglasses into clear reading glasses — never do this):
- Look closely at each person's eyes in the photo and draw exactly what they wear: no glasses, clear eyeglasses, or sunglasses (dark or tinted lenses that hide the eyes). Never add, remove, or swap eyewear.
- Match the real frame shape and weight: aviator (teardrop lenses, thin metal frame, double bridge), round, cat-eye, oval, rectangular, oversized, or wraparound sport; thin wire versus thick plastic rims.
- Sunglasses: when the lenses hide the eyes, draw NO eyes, irises, pupils, or eyelids behind them. Each lens is one clean closed outline left EMPTY WHITE for coloring, with at most one or two short diagonal glare lines inside. Do not fill the lenses black.
- Clear eyeglasses: draw the frame outline and the eyes visible through the lenses, by the eye rules above.
- Glasses pushed up on the head, hooked on a shirt, or held in a hand: draw them there, in their real shape.

Fills (required):
- Every large area inside a shape must stay EMPTY WHITE for coloring — never fill clothing, sky, skin, hair, or backgrounds with solid black.
- NEVER use solid black fills anywhere on the page — not for shadows, shirts, hair masses, or compression blocks. Outlines only; all interiors white.
- If a region would become a solid black shape, leave it white instead.
- Dark photo areas (night sky, dark hair, sunglasses lenses, black face masks, dark clothing) must still be EMPTY WHITE on the coloring page — trace only the outer edges, never paint those areas solid black.`;
}

export function buildPhotoColoringPrompt(
  printPrefs: PrintPrefs,
  layout: PhotoLayout,
  /** The page; a different shape from the photo's when the page is turned the other way. */
  canvas: PhotoLayout = letterCanvasFor(layout),
) {
  const title = printPrefs.showTitle ? "My photo coloring page" : "Coloring sheet";
  const prefs = { ...printPrefs, orientation: canvas.orientation };

  return `You are turning a REAL photograph into a printable coloring sheet for an 8.5 × 11 in page.
Goal: a faithful coloring-sheet rendering of exactly what you see in this photo — the same people, faces, hair, clothing, poses, and setting — drawn by the line-art rules below.

Faithfulness (most important):
- Match the photo's subjects, composition, poses, proportions, and layout as closely as a coloring page allows.
- Every person must be recognizable as themselves: their real face shape, hairstyle, and clothing from the photo.
- Accessories (glasses, sunglasses, hats, jewelry, watches, bags) appear exactly as in the photo — same type and shape, nothing added or left out.
- Do NOT invent new characters, objects, backgrounds, or story elements that are not in the photo.
- Do NOT cartoonify into a different scene. Stay true to what is actually visible.
- Preserve relative sizes and positions of people, pets, objects, and scenery from the photo.
- If something is unclear in the photo, simplify with honest outline shapes — do not guess wildly.

${photoLineArtStyleRules()}

${photoLayoutPromptBlock(layout, canvas)}

${coloringSheetOutputRules(prefs, title)}

Final check: faithful to the photo (nobody added, missing, or restyled); hair, faces, eyes, and clothing drawn as the line-art rules say; plain clothing stays plain and real prints keep their motif (dots stay dots); every visible face has a clear black nose and mouth (and eyes unless sunglasses hide them); facial hair is one smooth, empty shape; eyewear matches the photo (sunglasses stay sunglasses with no eyes drawn behind them); outlines only with white interiors; canvas is the ${canvas.aspectRatio} page shape, filled edge to edge.

Draw the photo as empty line art a kid can color.`;
}

export function buildPhotoCorrectionPrompt(
  printPrefs: PrintPrefs,
  corrections: string[],
  layout: PhotoLayout,
  canvas: PhotoLayout = letterCanvasFor(layout),
) {
  const title = printPrefs.showTitle ? "My photo coloring page" : "Coloring sheet";
  const prefs = { ...printPrefs, orientation: canvas.orientation };
  const list = corrections.map((line, i) => `${i + 1}. ${line}`).join("\n");

  return `You are editing an existing photo-based coloring sheet.

${photoLayoutPromptBlock(layout, canvas, "edit")}

You receive:
1) The CURRENT coloring sheet — the page to edit, and the base for your output.
2) The ORIGINAL photograph — reference only.

The CURRENT sheet is the source of truth. It may already include earlier edits the user asked for (things removed, added, moved, or restyled), so it can differ from the photograph on purpose. Keep every one of those differences. Never redraw the page from the photograph, and never "correct" the sheet back toward the photograph.

Apply ONLY the requests listed below. Everything else stays exactly as it is on the CURRENT sheet, unless a request needs a small adjustment nearby.
Treat each request as a surgical edit: change only what that note describes; preserve all other lines, shapes, and composition from the CURRENT sheet.
Use the photograph only to see how a detail mentioned in a request really looks (a face, a pattern, an object that was missed).

Line weight (critical):
- Match the CURRENT sheet exactly: same stroke thickness and boldness as that sheet — not thinner, not thicker.
- Output one complete replacement coloring-sheet image (full canvas). Do not overlay or trace on top of the sheet reference.
- Do NOT retrace, duplicate, or stack a second line on an edge that already exists (that makes lines bolder).
- Do NOT simplify, fade, or hairline-ify strokes that already exist (that makes lines thinner).

Do NOT redesign the whole page. Do NOT add anything the requests don't ask for.

Requests:
${list}

${photoLineArtStyleRules()}

${coloringSheetOutputRules(prefs, title)}

Return the CURRENT coloring sheet with only these requests applied.`;
}

/**
 * Recomposing a photo onto a canvas of the other shape (landscape to portrait, or portrait to
 * landscape); the result is still a photo.
 */
export function buildPhotoPortraitPrompt(source: PhotoLayout, target: PhotoLayout) {
  const toPortrait = target.orientation === "portrait";
  const from = toPortrait ? "LANDSCAPE" : "PORTRAIT";
  const to = toPortrait ? "PORTRAIT (taller than wide)" : "LANDSCAPE (wider than tall)";
  const howTo = toPortrait
    ? `- Extend the scene naturally above and below the subjects (more sky, ceiling, wall, ground, floor) so it reads as the same place and the same moment.
- You may trim empty background at the far left and right, but never cut off a person or a key object.`
    : `- Extend the scene naturally to the left and right of the subjects (more of the room, yard, street, or landscape) so it reads as the same place and the same moment.
- You may trim empty sky, ceiling, or ground at the very top and bottom, but never cut off a person's head or feet or a key object.`;
  return `You are reframing a REAL photograph from ${from.toLowerCase()} to ${toPortrait ? "portrait" : "landscape"}. The result must still be the same photograph — a photo, not a drawing.

${printPagePromptBlock(target, "photo")}

CANVAS (mandatory):
- The reference photo is ${from}, about ${source.aspectRatio}.
- The output MUST be ${to} at ${target.aspectRatio}.
- Do NOT rotate the photo or turn the scene on its side. Up stays up.

Keep everything that matters (most important):
- Every person, pet, and key object in the reference must appear in the output — the same number of people, nobody removed, nobody added.
- Keep each person exactly as photographed: same face, expression, hair, skin tone, clothing, pose, and proportions. Do not restyle, beautify, or redraw them.
- Keep the same arrangement: who stands left, right, in front, and behind, and how far apart they are relative to each other.
- Do NOT stretch, squash, or distort anything to make it fit.

How to make it ${toPortrait ? "portrait" : "landscape"}:
${howTo}
- Match the reference's lighting, colors, focus, and camera look. The added areas must blend in seamlessly.
- No borders, frames, text, captions, watermarks, or collage panels. One continuous photograph, edge to edge.`;
}
