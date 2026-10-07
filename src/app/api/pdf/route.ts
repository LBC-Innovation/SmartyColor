import { sheetToPdf } from "@/lib/print/pdf";
import type { PrintPrefs } from "@/lib/print/settings";

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
    const message =
      error instanceof Error ? error.message : "Could not make a PDF.";
    return Response.json({ error: message }, { status: 400 });
  }
}
