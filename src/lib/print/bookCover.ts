/**
 * Cover geometry and the cover design a customer builds in the book wizard.
 *
 * Numbers come from Lulu's US Letter cover templates and Book Creation Guide:
 * every cover file carries a 0.125″ bleed past the trim edge, text stays 0.5″
 * inside the trim edge, and a paperback spine is `pages / 444 + 0.06` inches.
 * Pure math and plain data (no DOM, no pdf-lib) so the browser preview and the
 * server's print PDF share it.
 */
import type { BookBindingId } from "@/lib/print/bookBindings";
import { BOOK_TRIM_HEIGHT_IN, BOOK_TRIM_WIDTH_IN, type LayoutBox } from "@/lib/print/pageLayout";

/** Printed past the trim edge on every side, then cut away. */
export const COVER_BLEED_IN = 0.125;
/** Text and anything important stays this far inside the trim edge. */
export const COVER_SAFETY_IN = 0.5;
/** Extra room on the binding edge of a spiral cover so text clears the punched holes. */
const COIL_BINDING_SAFETY_IN = 0.75;

/** The front panel as it is drawn: trim size plus bleed on all four sides. */
export const COVER_FRONT_WIDTH_IN = BOOK_TRIM_WIDTH_IN + COVER_BLEED_IN * 2;
export const COVER_FRONT_HEIGHT_IN = BOOK_TRIM_HEIGHT_IN + COVER_BLEED_IN * 2;

/** Resolution of the print-ready front cover image (Lulu asks for 300–600 PPI). */
export const COVER_PRINT_PPI = 300;
/** Below this a photo looks visibly soft in print (Lulu's minimum for simple graphics). */
export const COVER_MIN_PPI = 150;

/** Lulu's paperback spine formula. Saddle stitch and coil covers have no spine. */
export function coverSpineWidthIn(bindingId: BookBindingId, pageCount: number): number {
  return bindingId === "perfect_bound" ? pageCount / 444 + 0.06 : 0;
}

export type CoverSpread = {
  /** Full file size, bleed included: back cover, spine, front cover left to right. */
  widthIn: number;
  heightIn: number;
  spineIn: number;
  /** Left trim edge of the front cover, measured from the left of the file. */
  frontTrimXIn: number;
};

export function coverSpread(bindingId: BookBindingId, pageCount: number): CoverSpread {
  const spineIn = coverSpineWidthIn(bindingId, pageCount);
  return {
    widthIn: COVER_BLEED_IN * 2 + BOOK_TRIM_WIDTH_IN * 2 + spineIn,
    heightIn: COVER_FRONT_HEIGHT_IN,
    spineIn,
    frontTrimXIn: COVER_BLEED_IN + BOOK_TRIM_WIDTH_IN + spineIn,
  };
}

/**
 * Where text may sit on the front panel, in inches from the panel's top-left
 * (bleed included). The binding edge of a front cover is its left side.
 */
export function coverFrontSafeBox(bindingId: BookBindingId): LayoutBox {
  const left = COVER_BLEED_IN + (bindingId === "coil_bound" ? COIL_BINDING_SAFETY_IN : COVER_SAFETY_IN);
  const top = COVER_BLEED_IN + COVER_SAFETY_IN;
  return {
    x: left,
    y: top,
    width: COVER_FRONT_WIDTH_IN - left - COVER_BLEED_IN - COVER_SAFETY_IN,
    height: COVER_FRONT_HEIGHT_IN - top * 2,
  };
}

/**
 * Tile `count` pictures over an area, in reading order, with no empty cells:
 * the column count keeps cells closest to square, and a short last row
 * stretches its cells across the full width.
 */
export function coverGridCells(count: number, width: number, height: number): LayoutBox[] {
  if (count < 1) return [];
  let cols = 1;
  let best = Number.POSITIVE_INFINITY;
  for (let c = 1; c <= count; c += 1) {
    const rows = Math.ceil(count / c);
    const score = Math.abs(Math.log(width / c / (height / rows)));
    if (score < best - 1e-9) {
      best = score;
      cols = c;
    }
  }
  const rows = Math.ceil(count / cols);
  const cellHeight = height / rows;
  const cells: LayoutBox[] = [];
  for (let row = 0; row < rows; row += 1) {
    const inRow = row === rows - 1 ? count - cols * (rows - 1) : cols;
    const cellWidth = width / inRow;
    for (let col = 0; col < inRow; col += 1) {
      cells.push({ x: col * cellWidth, y: row * cellHeight, width: cellWidth, height: cellHeight });
    }
  }
  return cells;
}

export const COVER_LAYOUTS = ["grid", "photo", "none"] as const;
export type CoverLayout = (typeof COVER_LAYOUTS)[number];

export const COVER_IMAGE_SOURCES = ["photos", "sheets"] as const;
/** Cover pictures: the original color photos, or the coloring pages made from them. */
export type CoverImageSource = (typeof COVER_IMAGE_SOURCES)[number];

export const COVER_FONTS = [
  { id: "rounded", label: "Rounded", cssVar: "--font-fredoka", fallback: "sans-serif", weight: 600 },
  { id: "clean", label: "Clean", cssVar: "--font-dm-sans", fallback: "sans-serif", weight: 700 },
  { id: "handwritten", label: "Handwritten", cssVar: "--font-comic", fallback: "cursive", weight: 700 },
  { id: "classic", label: "Classic", cssVar: null, fallback: "Georgia, 'Times New Roman', serif", weight: 700 },
] as const;
export type CoverFontId = (typeof COVER_FONTS)[number]["id"];

export const COVER_TEXT_POSITIONS = ["top", "middle", "bottom"] as const;
export type CoverTextPosition = (typeof COVER_TEXT_POSITIONS)[number];
export const COVER_TEXT_ALIGNS = ["left", "center", "right"] as const;
export type CoverTextAlign = (typeof COVER_TEXT_ALIGNS)[number];

export const COVER_TEXT_MAX_LENGTH = 240;
export const COVER_TEXT_SIZE_MIN_PT = 24;
export const COVER_TEXT_SIZE_MAX_PT = 140;

export type BookCoverDesign = {
  layout: CoverLayout;
  imageSource: CoverImageSource;
  /** Wizard page id of the picture used by the single-photo layout. */
  coverPageId: string | null;
  text: string;
  textColor: string;
  fontId: CoverFontId;
  /** Type size on the printed cover, in points. Shrinks to fit if the text is long. */
  textSizePt: number;
  textPosition: CoverTextPosition;
  textAlign: CoverTextAlign;
  /** Tint between the pictures and the text. */
  overlayEnabled: boolean;
  overlayColor: string;
  /** 0 (clear) to 1 (solid). */
  overlayOpacity: number;
  /** The no-photo front, the back cover and the spine. */
  backgroundColor: string;
};

export function defaultCoverDesign(text: string): BookCoverDesign {
  return {
    layout: "grid",
    imageSource: "photos",
    coverPageId: null,
    text,
    textColor: "#ffffff",
    fontId: "rounded",
    textSizePt: 64,
    textPosition: "middle",
    textAlign: "center",
    overlayEnabled: true,
    overlayColor: "#1f2937",
    overlayOpacity: 0.45,
    backgroundColor: "#7446f0",
  };
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function color(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX_COLOR.test(value) ? value.toLowerCase() : fallback;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/** Whitelist and clamp a design from untrusted input; safe for client and server. */
export function normalizeCoverDesign(input: unknown): BookCoverDesign {
  const d = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const base = defaultCoverDesign("");
  return {
    layout: pick(d.layout, COVER_LAYOUTS, base.layout),
    imageSource: pick(d.imageSource, COVER_IMAGE_SOURCES, base.imageSource),
    coverPageId: typeof d.coverPageId === "string" && d.coverPageId ? d.coverPageId.slice(0, 200) : null,
    text: typeof d.text === "string" ? d.text.slice(0, COVER_TEXT_MAX_LENGTH) : "",
    textColor: color(d.textColor, base.textColor),
    fontId: pick(d.fontId, COVER_FONTS.map((f) => f.id), base.fontId),
    textSizePt: clamp(d.textSizePt, COVER_TEXT_SIZE_MIN_PT, COVER_TEXT_SIZE_MAX_PT, base.textSizePt),
    textPosition: pick(d.textPosition, COVER_TEXT_POSITIONS, base.textPosition),
    textAlign: pick(d.textAlign, COVER_TEXT_ALIGNS, base.textAlign),
    overlayEnabled: d.overlayEnabled === true,
    overlayColor: color(d.overlayColor, base.overlayColor),
    overlayOpacity: clamp(d.overlayOpacity, 0, 1, base.overlayOpacity),
    backgroundColor: color(d.backgroundColor, base.backgroundColor),
  };
}

/** `#rrggbb` to 0–1 channels. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = Number.parseInt(HEX_COLOR.test(hex) ? hex.slice(1) : "ffffff", 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

export type BookOpenSpread = {
  /** 1-based page numbers; null is the inside of a cover. */
  left: number | null;
  right: number | null;
};

/** The book as it lies open: page 1 on the right, then 2–3, 4–5, and so on. */
export function bookOpenSpreads(pageCount: number): BookOpenSpread[] {
  const spreads: BookOpenSpread[] = [];
  for (let left = 0; left <= pageCount; left += 2) {
    spreads.push({ left: left === 0 ? null : left, right: left + 1 <= pageCount ? left + 1 : null });
  }
  return spreads;
}
