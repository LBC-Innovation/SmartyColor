import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { payForExtraPage } from "@/server/purchaseCodesService";

type Params = { params: Promise<{ id: string }> };

/** Pays for a page the album's book package doesn't cover, from the caller's credit. */
export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const result = await payForExtraPage(auth.user.id, id);
  const code = result.error?.code;
  if (code === "NOT_FOUND") return jsonError(result.error!.message, 404, code);
  if (code === "INSUFFICIENT_CREDITS") return jsonError(result.error!.message, 402, code);
  if (code === "INVALID" || code === "ALREADY") return jsonError(result.error!.message, 409, code);
  return jsonResult(result, result.error ? 500 : 200);
}
