import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import {
  PRINT_MARGIN_PT,
  paperSizePt,
  pdfDrawOptions,
  placeImageInBox,
} from "@/lib/print/pageLayout";
import type { PrintPrefs } from "@/lib/print/settings";

/**
 * Builds the story book PDF: a title page, one page per photo with its
 * paragraph beneath, and a closing page. Pure pdf-lib, so it runs in the
 * browser — the page images never leave the device.
 */

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function embedImage(pdf: PDFDocument, imageDataUrl: string) {
  const match = imageDataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) throw new Error("Could not read image for PDF.");
  const bytes = base64ToBytes(match[2]);
  return match[1].includes("png") ? pdf.embedPng(bytes) : pdf.embedJpg(bytes);
}

export type StorybookPdfPage = {
  /** JPEG or PNG data URL. */
  imageDataUrl: string;
  text: string;
  printPrefs: PrintPrefs;
};

export type StorybookPdfInput = {
  title: string;
  introduction: string;
  closing: string;
  pages: StorybookPdfPage[];
  /** Paper for the title and closing pages. */
  printPrefs: PrintPrefs;
};

type Fonts = { regular: PDFFont; bold: PDFFont };

function drawTitlePage(pdf: PDFDocument, fonts: Fonts, input: StorybookPdfInput) {
  const [width, height] = paperSizePt(input.printPrefs);
  const page = pdf.addPage([width, height]);
  const margin = PRINT_MARGIN_PT;

  page.drawText(input.title.trim() || "Our story", {
    x: margin,
    y: height - margin - 40,
    size: 22,
    font: fonts.bold,
    color: rgb(0.1, 0.12, 0.2),
    maxWidth: width - margin * 2,
  });

  let y = height - margin - 90;
  for (const line of wrapText(input.introduction, 64)) {
    page.drawText(line, {
      x: margin,
      y,
      size: 12,
      font: fonts.regular,
      color: rgb(0.2, 0.22, 0.28),
      maxWidth: width - margin * 2,
    });
    y -= 16;
  }
}

async function drawStoryPage(pdf: PDFDocument, fonts: Fonts, storyPage: StorybookPdfPage) {
  const [width, height] = paperSizePt(storyPage.printPrefs);
  const page = pdf.addPage([width, height]);
  const margin = PRINT_MARGIN_PT;
  const textBlockHeight = height * 0.28;
  const imageBottom = margin + textBlockHeight + 16;

  const image = await embedImage(pdf, storyPage.imageDataUrl);
  const placement = placeImageInBox({
    box: {
      x: margin,
      y: margin,
      width: width - margin * 2,
      height: height - margin - imageBottom,
    },
    imageWidth: image.width,
    imageHeight: image.height,
    valign: "bottom",
  });
  const draw = pdfDrawOptions(placement, height);
  page.drawImage(image, {
    x: draw.x,
    y: draw.y,
    width: draw.width,
    height: draw.height,
  });

  const lines = wrapText(storyPage.text, 72);
  let y = margin + textBlockHeight - 14;
  for (let i = 0; i < lines.length; i++) {
    page.drawText(lines[i], {
      x: margin,
      y,
      size: i === 0 ? 11 : 10,
      font: i === 0 ? fonts.bold : fonts.regular,
      color: rgb(0.12, 0.14, 0.18),
      maxWidth: width - margin * 2,
    });
    y -= 14;
  }
}

function drawClosingPage(pdf: PDFDocument, fonts: Fonts, input: StorybookPdfInput) {
  const closing = input.closing.trim();
  if (!closing) return;
  const [width, height] = paperSizePt(input.printPrefs);
  const page = pdf.addPage([width, height]);
  const margin = PRINT_MARGIN_PT;
  const lines = wrapText(closing, 64);
  let y = height / 2 + (lines.length * 18) / 2;
  for (const line of lines) {
    page.drawText(line, {
      x: margin,
      y,
      size: 14,
      font: fonts.regular,
      color: rgb(0.2, 0.22, 0.28),
      maxWidth: width - margin * 2,
    });
    y -= 18;
  }
}

export async function buildStorybookPdf(input: StorybookPdfInput): Promise<Uint8Array> {
  if (input.pages.length === 0) {
    throw new Error("Add at least one story page.");
  }
  const pdf = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  drawTitlePage(pdf, fonts, input);
  for (const page of input.pages) {
    await drawStoryPage(pdf, fonts, page);
  }
  drawClosingPage(pdf, fonts, input);
  return pdf.save();
}
