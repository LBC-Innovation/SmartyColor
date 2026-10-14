/**
 * Draws the front cover on a canvas. The wizard preview and the print-ready
 * image sent to the printer both come from here, so what the customer approves
 * is what gets printed. Browser only.
 */
import type { BookBindingId } from "@/lib/print/bookBindings";
import {
  COVER_FONTS,
  COVER_FRONT_HEIGHT_IN,
  COVER_FRONT_WIDTH_IN,
  COVER_PRINT_PPI,
  coverFrontSafeBox,
  coverGridCells,
  type BookCoverDesign,
} from "@/lib/print/bookCover";
import { POINTS_PER_INCH, type LayoutBox } from "@/lib/print/pageLayout";

const LINE_HEIGHT = 1.15;
const MIN_TEXT_SIZE_PT = 10;

type Picture = { canvas: HTMLCanvasElement; naturalWidth: number; naturalHeight: number };

const pictures = new Map<string, Promise<Picture>>();

/** Free the decoded cover pictures (they are large) when the wizard closes. */
export function clearCoverPictureCache() {
  pictures.clear();
}

/**
 * Decode a picture once, kept no larger than it needs to be to fill its cell
 * at print resolution, so a grid of many photos stays within memory.
 */
function loadPicture(src: string, cell: LayoutBox): Promise<Picture> {
  const needW = Math.ceil(cell.width * COVER_PRINT_PPI);
  const needH = Math.ceil(cell.height * COVER_PRINT_PPI);
  const key = `${src}|${needW}x${needH}`;
  const cached = pictures.get(key);
  if (cached) return cached;

  const task = (async () => {
    const img = new Image();
    // Cloud images may still be signed storage URLs; CORS keeps the canvas readable.
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.src = src;
    await img.decode();
    const scale = Math.min(1, Math.max(needW / img.naturalWidth, needH / img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { canvas, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight };
  })();
  pictures.set(key, task);
  task.catch(() => pictures.delete(key));
  return task;
}

/** CSS font-family for a cover font, resolved from the app's loaded web fonts. */
function fontFamily(design: BookCoverDesign, host: Element): { family: string; weight: number } {
  const font = COVER_FONTS.find((f) => f.id === design.fontId) ?? COVER_FONTS[0];
  const loaded = font.cssVar ? getComputedStyle(host).getPropertyValue(font.cssVar).trim() : "";
  return { family: loaded ? `${loaded}, ${font.fallback}` : font.fallback, weight: font.weight };
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

export type CoverRenderInput = {
  design: BookCoverDesign;
  /** Picture URLs in book order (grid), or the one chosen picture (single photo). */
  sources: string[];
  bindingId: BookBindingId;
  /** Canvas width in pixels; the height follows the cover's proportions. */
  widthPx: number;
  /** Any element inside the app shell, used to resolve the web fonts. */
  fontHost: Element;
};

export type CoverRenderResult = {
  /** Lowest print resolution among the pictures used, or null when there are none. */
  lowestPpi: number | null;
};

export async function drawFrontCover(
  canvas: HTMLCanvasElement,
  input: CoverRenderInput,
): Promise<CoverRenderResult> {
  const { design, bindingId } = input;
  const pxPerIn = input.widthPx / COVER_FRONT_WIDTH_IN;
  canvas.width = Math.round(input.widthPx);
  canvas.height = Math.round(COVER_FRONT_HEIGHT_IN * pxPerIn);
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = design.backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let lowestPpi: number | null = null;
  const sources = design.layout === "none" ? [] : input.sources;
  if (sources.length > 0) {
    const cells =
      design.layout === "photo"
        ? [{ x: 0, y: 0, width: COVER_FRONT_WIDTH_IN, height: COVER_FRONT_HEIGHT_IN }]
        : coverGridCells(sources.length, COVER_FRONT_WIDTH_IN, COVER_FRONT_HEIGHT_IN);
    for (const [i, cell] of cells.entries()) {
      let picture: Picture;
      try {
        picture = await loadPicture(sources[i], cell);
      } catch {
        continue; // Leave the background showing rather than fail the whole cover.
      }
      // Fill the cell, cropping whichever side overflows, centred.
      const { canvas: src } = picture;
      const scale = Math.max(cell.width / src.width, cell.height / src.height);
      const sw = cell.width / scale;
      const sh = cell.height / scale;
      ctx.drawImage(
        src,
        (src.width - sw) / 2,
        (src.height - sh) / 2,
        sw,
        sh,
        cell.x * pxPerIn,
        cell.y * pxPerIn,
        cell.width * pxPerIn,
        cell.height * pxPerIn,
      );
      const ppi = Math.min(picture.naturalWidth / cell.width, picture.naturalHeight / cell.height);
      lowestPpi = lowestPpi == null ? ppi : Math.min(lowestPpi, ppi);
    }

    if (design.overlayEnabled && design.overlayOpacity > 0) {
      ctx.globalAlpha = design.overlayOpacity;
      ctx.fillStyle = design.overlayColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
    }
  }

  const text = design.text.trim();
  if (text) {
    const safe = coverFrontSafeBox(bindingId);
    const { family, weight } = fontFamily(design, input.fontHost);
    const pxPerPt = pxPerIn / POINTS_PER_INCH;
    try {
      await document.fonts.load(`${weight} 48px ${family}`, text);
    } catch {
      /* fall back to whatever is available */
    }

    // Shrink until every line fits the safe area, so nothing is trimmed off in print.
    let sizePt = design.textSizePt;
    let lines: string[] = [];
    for (;;) {
      ctx.font = `${weight} ${sizePt * pxPerPt}px ${family}`;
      lines = wrapLines(ctx, text, safe.width * pxPerIn);
      const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
      const height = lines.length * sizePt * LINE_HEIGHT * pxPerPt;
      if ((widest <= safe.width * pxPerIn && height <= safe.height * pxPerIn) || sizePt <= MIN_TEXT_SIZE_PT) break;
      sizePt = Math.max(MIN_TEXT_SIZE_PT, sizePt * 0.94);
    }

    const lineHeight = sizePt * LINE_HEIGHT * pxPerPt;
    const blockHeight = lines.length * lineHeight;
    const top =
      design.textPosition === "top"
        ? safe.y * pxPerIn
        : design.textPosition === "bottom"
          ? (safe.y + safe.height) * pxPerIn - blockHeight
          : (safe.y + safe.height / 2) * pxPerIn - blockHeight / 2;
    const x =
      design.textAlign === "left"
        ? safe.x * pxPerIn
        : design.textAlign === "right"
          ? (safe.x + safe.width) * pxPerIn
          : (safe.x + safe.width / 2) * pxPerIn;
    ctx.fillStyle = design.textColor;
    ctx.textAlign = design.textAlign;
    ctx.textBaseline = "middle";
    lines.forEach((line, i) => ctx.fillText(line, x, top + lineHeight * (i + 0.5)));
  }

  return { lowestPpi };
}

/** The print-ready front cover: a 300 PPI JPEG, bleed included. */
export async function renderFrontCoverJpeg(input: Omit<CoverRenderInput, "widthPx">): Promise<Blob> {
  const canvas = document.createElement("canvas");
  await drawFrontCover(canvas, { ...input, widthPx: COVER_FRONT_WIDTH_IN * COVER_PRINT_PPI });
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) throw new Error("Could not prepare the cover image.");
  return blob;
}
