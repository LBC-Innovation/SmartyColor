import { PDFDocument, PageSizes, StandardFonts, rgb } from "pdf-lib";
import type { PrintPrefs } from "@/lib/print/settings";

function pageSize(prefs: PrintPrefs): [number, number] {
  const letter = PageSizes.Letter;
  const a4 = PageSizes.A4;
  const size = prefs.paper === "a4" ? a4 : letter;
  if (prefs.orientation === "landscape") {
    return [size[1], size[0]];
  }
  return size;
}

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

async function embedImage(pdf: PDFDocument, imageDataUrl: string) {
  const match = imageDataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!match) throw new Error("Could not read image for PDF.");
  const mime = match[1];
  const bytes = Buffer.from(match[2], "base64");
  return mime.includes("png")
    ? pdf.embedPng(bytes)
    : pdf.embedJpg(bytes);
}

export type StorybookPdfPage = {
  imageDataUrl: string;
  text: string;
  printPrefs: PrintPrefs;
};

export async function storybookToPdf(pages: StorybookPdfPage[]) {
  if (pages.length === 0) {
    throw new Error("Add at least one story page.");
  }

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  for (const storyPage of pages) {
    const [width, height] = pageSize(storyPage.printPrefs);
    const page = pdf.addPage([width, height]);
    const margin = 40;
    const textBlockHeight = height * 0.28;
    const imageTop = height - margin;
    const imageBottom = margin + textBlockHeight + 16;
    const maxW = width - margin * 2;
    const maxH = imageTop - imageBottom;

    const image = await embedImage(pdf, storyPage.imageDataUrl);
    const scale = Math.min(maxW / image.width, maxH / image.height);
    const drawW = image.width * scale;
    const drawH = image.height * scale;
    page.drawImage(image, {
      x: (width - drawW) / 2,
      y: imageBottom,
      width: drawW,
      height: drawH,
    });

    const lines = wrapText(storyPage.text, 72);
    let y = margin + textBlockHeight - 14;
    for (let i = 0; i < lines.length; i++) {
      page.drawText(lines[i], {
        x: margin,
        y,
        size: i === 0 ? 11 : 10,
        font: i === 0 ? fontBold : font,
        color: rgb(0.12, 0.14, 0.18),
        maxWidth: width - margin * 2,
      });
      y -= 14;
    }
  }

  return pdf.save();
}

export async function storybookTitlePagePdf(input: {
  title: string;
  introduction: string;
  printPrefs: PrintPrefs;
}) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const [width, height] = pageSize(input.printPrefs);
  const page = pdf.addPage([width, height]);
  const margin = 48;

  page.drawText(input.title, {
    x: margin,
    y: height - margin - 40,
    size: 22,
    font: fontBold,
    color: rgb(0.1, 0.12, 0.2),
    maxWidth: width - margin * 2,
  });

  const lines = wrapText(input.introduction, 64);
  let y = height - margin - 90;
  for (const line of lines) {
    page.drawText(line, {
      x: margin,
      y,
      size: 12,
      font,
      color: rgb(0.2, 0.22, 0.28),
      maxWidth: width - margin * 2,
    });
    y -= 16;
  }

  return pdf.save();
}
