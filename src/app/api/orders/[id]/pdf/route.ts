import { jsonError } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { getDigitalOrderPdf } from "@/server/digitalBookService";

type Params = { params: Promise<{ id: string }> };

/** Download (or re-download) the PDF of a paid print-at-home order. */
export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const result = await getDigitalOrderPdf(auth.user.id, id);
  if (result.error) {
    const code = result.error.code;
    const status = code === "NOT_FOUND" ? 404 : code === "INVALID_STATE" ? 409 : 500;
    return jsonError(result.error.message, status, code);
  }

  const name = result.data!.title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "coloring-book";
  return new Response(Buffer.from(result.data!.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
