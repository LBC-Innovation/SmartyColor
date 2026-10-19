import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { sendAlbumToFamily } from "@/server/familySendService";

type Params = { params: Promise<{ id: string }> };

// Reads and shrinks every page, then builds the PDF.
export const maxDuration = 60;

/** Email the album's coloring pages as a printable PDF: body { email, note? }. Signed-in only. */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { email?: unknown; note?: unknown };
  if (typeof body.email !== "string") return jsonError("email is required", 400);
  const result = await sendAlbumToFamily({
    user: auth.user,
    projectId: id,
    email: body.email,
    note: typeof body.note === "string" ? body.note : "",
  });
  const code = result.error?.code;
  if (code === "NOT_FOUND") return jsonError(result.error!.message, 404, code);
  if (code === "INVALID_EMAIL" || code === "NO_PAGES" || code === "TOO_LARGE") {
    return jsonError(result.error!.message, 400, code);
  }
  if (code === "LIMIT") return jsonError(result.error!.message, 429, code);
  if (code === "UNAVAILABLE") return jsonError(result.error!.message, 503, code);
  return jsonResult(result, result.error ? 500 : 200);
}
