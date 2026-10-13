import { jsonError } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { getDigitalOrderPdf } from "@/server/digitalBookService";
import { getPrintOrderFilePath } from "@/server/ordersService";
import { getObjectBytes } from "@/server/storage/libraryFiles";

type Params = { params: Promise<{ id: string }> };

async function loadPdf(userId: string, orderId: string, file: string | null) {
  if (file !== "interior" && file !== "cover") return getDigitalOrderPdf(userId, orderId);
  const found = await getPrintOrderFilePath(userId, orderId, file);
  if (found.error) return { data: null, error: found.error };
  try {
    const { bytes } = await getObjectBytes(found.data!.path);
    return { data: { bytes, title: found.data!.title }, error: null };
  } catch {
    return { data: null, error: { message: "Print file not found", code: "NOT_FOUND" } };
  }
}

/**
 * Download (or re-download) the PDF of a paid print-at-home order, or with
 * `?file=interior|cover` one of a printed order's print-ready files.
 */
export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const result = await loadPdf(auth.user.id, id, new URL(request.url).searchParams.get("file"));
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
