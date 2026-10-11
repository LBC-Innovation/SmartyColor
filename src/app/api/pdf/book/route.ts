import { sheetsToPdf, type PdfSheetPage } from "@/lib/print/pdf";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import type { PrintPrefs } from "@/lib/print/settings";
import { revisionDataUrlById } from "@/server/libraryImages";

type Body =
  | { pages: PdfSheetPage[] }
  /* Cloud library: sheets are read from storage by revision id. */
  | { revisions: Array<{ revisionId: string; printPrefs: PrintPrefs }> };

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    let pages: PdfSheetPage[];
    if ("revisions" in body) {
      const auth = await requireAuthRequest(request);
      if ("error" in auth) return auth.error;
      pages = [];
      for (const item of body.revisions ?? []) {
        const rev = await revisionDataUrlById(auth.user.id, item.revisionId);
        if (rev.error) return Response.json({ error: rev.error.message }, { status: 404 });
        pages.push({ imageDataUrl: rev.data!.dataUrl, printPrefs: item.printPrefs });
      }
    } else {
      pages = body.pages ?? [];
    }
    const bytes = await sheetsToPdf(pages);
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=colorful-memories-print-book.pdf",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not make a PDF book.";
    return Response.json({ error: message }, { status: 400 });
  }
}
