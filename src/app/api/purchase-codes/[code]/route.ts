import { jsonResult } from "@/lib/api/respond";
import { authenticateBearer } from "@/lib/auth/authenticate";
import { getPurchaseCodePreview } from "@/server/purchaseCodesService";

type Params = { params: Promise<{ code: string }> };

/** What a code includes and whether it can still be used. Open to everyone: the code is the secret. */
export async function GET(request: Request, { params }: Params) {
  const { code } = await params;
  const header = request.headers.get("authorization");
  const auth = header ? await authenticateBearer(header) : null;
  const userId = auth && !("error" in auth) ? auth.user.id : null;
  const result = await getPurchaseCodePreview(code, userId);
  return jsonResult(result, result.error ? (result.error.code === "NOT_FOUND" ? 404 : 500) : 200);
}
