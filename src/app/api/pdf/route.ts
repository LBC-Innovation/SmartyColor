import { sheetToPdf } from "@/lib/print/pdf";
import type { PrintPrefs } from "@/lib/print/settings";
import { toPublicErrorMessage } from "@/lib/security/publicError";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      imageDataUrl: string;
      printPrefs: PrintPrefs;
    };
    const bytes = await sheetToPdf(body.imageDataUrl, body.printPrefs);
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=coloring-sheet.pdf",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: toPublicErrorMessage(error, "Could not make a PDF."),
      },
      { status: 400 },
    );
  }
}
