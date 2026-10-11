import { sheetToPdf } from "@/lib/print/pdf";
import type { PrintPrefs } from "@/lib/print/settings";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { revisionDataUrlById } from "@/server/libraryImages";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      imageDataUrl?: string;
      /* Cloud library: read the sheet from storage instead. */
      revisionId?: string;
      printPrefs: PrintPrefs;
    };
    let imageDataUrl = body.imageDataUrl ?? "";
    if (body.revisionId) {
      const auth = await requireAuthRequest(request);
      if ("error" in auth) return auth.error;
      const rev = await revisionDataUrlById(auth.user.id, body.revisionId);
      if (rev.error) return Response.json({ error: rev.error.message }, { status: 404 });
      imageDataUrl = rev.data!.dataUrl;
    }
    const bytes = await sheetToPdf(imageDataUrl, body.printPrefs);
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=coloring-sheet.pdf",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not make a PDF.";
    return Response.json({ error: message }, { status: 400 });
  }
}
