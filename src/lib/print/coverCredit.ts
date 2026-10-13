/**
 * The credit printed at the bottom centre of every back cover, stacked:
 * "Made with" / the heart logo / "By ColorfulMemories.Net". Pure geometry,
 * shared by the print PDF and the wizard preview. Lettering is vector outlines,
 * so it stays sharp at any size and the PDF carries no font.
 */
import { BRAND_MARK } from "@/components/v2/ui/brandPaths";
import { COVER_BLEED_IN, COVER_FRONT_HEIGHT_IN, COVER_SAFETY_IN, hexToRgb } from "@/lib/print/bookCover";
import { COVER_CREDIT_ART } from "@/lib/print/coverCreditArt";
import { BOOK_TRIM_WIDTH_IN, POINTS_PER_INCH } from "@/lib/print/pageLayout";

const FONT_PT = 13;
/** Inches per font unit at the printed size. */
const UNIT_IN = FONT_PT / POINTS_PER_INCH / COVER_CREDIT_ART.unitsPerEm;
/** Font units. The heart is the centrepiece: about 0.8 inch tall in print. */
const HEART_HEIGHT = 4400;
/** Space between the heart and the lettering above and below it. */
const GAP = 420;
/** Room under a baseline for descenders (none in the last line, so it sits right on the margin). */
const DESCENT = 60;

const { ascent, before, after } = COVER_CREDIT_ART;
const heartScale = HEART_HEIGHT / BRAND_MARK.height;
const heartWidth = BRAND_MARK.width * heartScale;
const width = Math.max(before.width, after.width, heartWidth);
const heartY = ascent + DESCENT + GAP;
const afterY = heartY + HEART_HEIGHT + GAP;
const height = afterY + ascent + DESCENT;

/** Everything in font units, y down, origin at the top-left of the block; each row is centred. */
export const COVER_CREDIT = {
  width,
  height,
  before: { x: (width - before.width) / 2, y: 0, d: before.d },
  after: { x: (width - after.width) / 2, y: afterY, d: after.d },
  heart: {
    x: (width - heartWidth) / 2,
    y: heartY,
    scale: heartScale,
    paths: BRAND_MARK.paths,
    /** Width of the white rim (in the heart's own units) drawn behind it on a dark cover. */
    rim: 14,
  },
  widthIn: width * UNIT_IN,
  heightIn: height * UNIT_IN,
  unitIn: UNIT_IN,
  /** The last line's baseline sits on the safety margin: this far above the trimmed bottom edge. */
  bottomIn: COVER_SAFETY_IN - DESCENT * UNIT_IN,
} as const;

/**
 * Top-left of the credit on the cover file, in inches from the file's top-left.
 * The back cover is the left panel in every binding.
 */
export function coverCreditOrigin(): { xIn: number; yIn: number } {
  return {
    xIn: COVER_BLEED_IN + BOOK_TRIM_WIDTH_IN / 2 - COVER_CREDIT.widthIn / 2,
    yIn: COVER_FRONT_HEIGHT_IN - COVER_BLEED_IN - COVER_CREDIT.bottomIn - COVER_CREDIT.heightIn,
  };
}

/** White lettering on a dark back cover, dark lettering on a light one. */
export function coverCreditOnDark(backgroundColor: string): boolean {
  const { r, g, b } = hexToRgb(backgroundColor);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.6;
}

export const COVER_CREDIT_LIGHT = "#ffffff";
export const COVER_CREDIT_DARK = "#1f2937";
