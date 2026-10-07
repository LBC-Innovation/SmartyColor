import { PDFDocument, PageSizes } from "pdf-lib";
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

export async function sheetToPdf(imageDataUrl: string, prefs: PrintPrefs) {
  const match = imageDataUrl.match(/^data:(.+);base64,(.+)$/);
  const svgMatch = imageDataUrl.match(/^data:image\/svg\+xml/);
  if (svgMatch && !match) {
    throw new Error("Print this page in the browser for sample drawings.");
  }
  if (!match) {
    throw new Error("Could not read the drawing.");
  }

  const mime = match[1];
  const bytes = Buffer.from(match[2], "base64");
  const pdf = await PDFDocument.create();
  const [width, height] = pageSize(prefs);
  const page = pdf.addPage([width, height]);
  const image =
    mime.includes("png")
      ? await pdf.embedPng(bytes)
      : await pdf.embedJpg(bytes);

  const margin = 36;
  const maxW = width - margin * 2;
  const maxH = height - margin * 2;
  const scale = Math.min(maxW / image.width, maxH / image.height);
  const drawW = image.width * scale;
  const drawH = image.height * scale;
  page.drawImage(image, {
    x: (width - drawW) / 2,
    y: (height - drawH) / 2,
    width: drawW,
    height: drawH,
  });

  return pdf.save();
}
