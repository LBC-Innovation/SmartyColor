import {
  storybookTitlePagePdf,
  storybookToPdf,
  type StorybookPdfPage,
} from "@/lib/print/storybookPdf";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { defaultPrintPrefs, type PrintPrefs } from "@/lib/print/settings";

type Body = {
  title?: string;
  introduction?: string;
  closing?: string;
  pages?: StorybookPdfPage[];
  printPrefs?: PrintPrefs;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const pages = body.pages ?? [];
    const printPrefs: PrintPrefs = body.printPrefs ?? defaultPrintPrefs;

    if (pages.length === 0) {
      return Response.json({ error: "No story pages to print." }, { status: 400 });
    }

    const titleBytes = await storybookTitlePagePdf({
      title: body.title?.trim() || "Our story",
      introduction: body.introduction?.trim() || "",
      printPrefs,
    });
    const storyBytes = await storybookToPdf(pages);

    const merged = await PDFDocument.create();
    const titleDoc = await PDFDocument.load(titleBytes);
    const storyDoc = await PDFDocument.load(storyBytes);
    const titlePages = await merged.copyPages(titleDoc, titleDoc.getPageIndices());
    titlePages.forEach((p) => merged.addPage(p));
    const storyPages = await merged.copyPages(storyDoc, storyDoc.getPageIndices());
    storyPages.forEach((p) => merged.addPage(p));

    if (body.closing?.trim()) {
      const closingDoc = await PDFDocument.create();
      const font = await closingDoc.embedFont(StandardFonts.Helvetica);
      const { width: cw, height: ch } = storyDoc.getPage(0).getSize();
      const page = closingDoc.addPage([cw, ch]);
      const { width, height } = page.getSize();
      page.drawText(body.closing.trim(), {
        x: 48,
        y: height / 2,
        size: 14,
        maxWidth: width - 96,
      });
      const closingPages = await merged.copyPages(
        closingDoc,
        closingDoc.getPageIndices(),
      );
      closingPages.forEach((p) => merged.addPage(p));
    }

    const bytes = await merged.save();
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=storybook.pdf",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not make the story PDF.";
    return Response.json({ error: message }, { status: 400 });
  }
}
