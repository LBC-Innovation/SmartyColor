import type { PDFDocument, PDFFont } from "pdf-lib";

/** Decodes base64 without Buffer so it works in the browser and on the server. */
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function registerFontkit(pdf: PDFDocument) {
  const fontkit = (await import("@pdf-lib/fontkit")).default;
  pdf.registerFontkit(fontkit);
}

/** Embeds (subset) PT Serif Italic. Standard-14 fonts are never embedded, which print vendors reject. */
export async function embedNoteFont(pdf: PDFDocument): Promise<PDFFont> {
  await registerFontkit(pdf);
  const { noteFontBase64 } = await import("./noteFont");
  return pdf.embedFont(base64ToBytes(noteFontBase64), { subset: true });
}

/** Embeds (subset) PT Sans Regular and Bold for the storybook. */
export async function embedStorybookFonts(pdf: PDFDocument): Promise<{ regular: PDFFont; bold: PDFFont }> {
  await registerFontkit(pdf);
  const [{ storybookRegularFontBase64 }, { storybookBoldFontBase64 }] = await Promise.all([
    import("./storybookRegularFont"),
    import("./storybookBoldFont"),
  ]);
  return {
    regular: await pdf.embedFont(base64ToBytes(storybookRegularFontBase64), { subset: true }),
    bold: await pdf.embedFont(base64ToBytes(storybookBoldFontBase64), { subset: true }),
  };
}
