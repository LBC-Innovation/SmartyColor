import { PDFDocument, rgb } from "pdf-lib";
import type { BookBindingId } from "@/lib/print/bookBindings";
import {
  COVER_BLEED_IN,
  COVER_FRONT_HEIGHT_IN,
  COVER_FRONT_WIDTH_IN,
  coverSpread,
  hexToRgb,
} from "@/lib/print/bookCover";
import {
  COVER_CREDIT,
  COVER_CREDIT_DARK,
  COVER_CREDIT_LIGHT,
  coverCreditOnDark,
  coverCreditOrigin,
} from "@/lib/print/coverCredit";
import { POINTS_PER_INCH } from "@/lib/print/pageLayout";

/**
 * Lulu's cover file: one page holding back cover, spine and front cover side by
 * side, with bleed and no trim or margin marks. The front is the image the
 * customer designed; the back cover and spine are the design's background
 * color, which keeps the spine the same color as the rest of the cover as the
 * guide asks. The back carries the "Made with / ♥ / By ColorfulMemories.Net" credit
 * at the bottom centre, on the safety margin, drawn as outlines so no font has
 * to be embedded. No spine text: Lulu forbids it at 80 pages or fewer and it drifts
 * with trim variance above that.
 */
export async function buildCoverPdf(input: {
  frontJpeg: Uint8Array;
  bindingId: BookBindingId;
  pageCount: number;
  backgroundColor: string;
}): Promise<Uint8Array> {
  const spread = coverSpread(input.bindingId, input.pageCount);
  const pt = (inches: number) => inches * POINTS_PER_INCH;
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([pt(spread.widthIn), pt(spread.heightIn)]);

  const front = await pdf.embedJpg(input.frontJpeg);
  page.drawImage(front, {
    x: pt(spread.frontTrimXIn - COVER_BLEED_IN),
    y: 0,
    width: pt(COVER_FRONT_WIDTH_IN),
    height: pt(COVER_FRONT_HEIGHT_IN),
  });

  // Painted after the front so the fold is a clean edge: the front's own
  // binding-side bleed would otherwise wrap onto the spine or back cover.
  const { r, g, b } = hexToRgb(input.backgroundColor);
  page.drawRectangle({
    x: 0,
    y: 0,
    width: pt(spread.frontTrimXIn),
    height: pt(spread.heightIn),
    color: rgb(r, g, b),
  });

  // The credit line. drawSvgPath takes the path's top-left origin in page
  // coordinates and flips y itself.
  const onDark = coverCreditOnDark(input.backgroundColor);
  const ink = hexToRgb(onDark ? COVER_CREDIT_LIGHT : COVER_CREDIT_DARK);
  const origin = coverCreditOrigin();
  const unit = pt(COVER_CREDIT.unitIn);
  const left = pt(origin.xIn);
  const top = pt(spread.heightIn - origin.yIn);
  const lettering = { scale: unit, color: rgb(ink.r, ink.g, ink.b) };
  for (const row of [COVER_CREDIT.before, COVER_CREDIT.after]) {
    page.drawSvgPath(row.d, { x: left + row.x * unit, y: top - row.y * unit, ...lettering });
  }

  const { heart } = COVER_CREDIT;
  const heartAt = { x: left + heart.x * unit, y: top - heart.y * unit, scale: heart.scale * unit };
  if (onDark) {
    // A white rim keeps the heart's darker petals from sinking into a dark cover.
    for (const petal of heart.paths) {
      page.drawSvgPath(petal.d, {
        ...heartAt,
        color: rgb(1, 1, 1),
        borderColor: rgb(1, 1, 1),
        borderWidth: heart.rim,
      });
    }
  }
  for (const petal of heart.paths) {
    const c = hexToRgb(petal.fill);
    page.drawSvgPath(petal.d, { ...heartAt, color: rgb(c.r, c.g, c.b) });
  }

  return pdf.save();
}
