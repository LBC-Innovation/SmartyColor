import { sheetsToPdf, type PdfSheetPage } from "@/lib/print/pdf";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { pages: PdfSheetPage[] };
    const pages = body.pages ?? [];
    const bytes = await sheetsToPdf(pages);
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=colorful-moments-print-book.pdf",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not make a PDF book.";
    return Response.json({ error: message }, { status: 400 });
  }
}
