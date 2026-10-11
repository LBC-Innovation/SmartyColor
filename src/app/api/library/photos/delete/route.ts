import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import * as library from "@/server/libraryService";

/** Bulk delete: body { ids: string[] } */
export async function POST(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const body = (await request.json().catch(() => ({}))) as { ids?: unknown };
  if (!Array.isArray(body.ids) || !body.ids.every((x) => typeof x === "string")) {
    return jsonError("ids must be a string array", 400);
  }
  const result = await library.deletePhotos(auth.user.id, body.ids as string[]);
  return jsonResult(result, result.error ? 500 : 200);
}
