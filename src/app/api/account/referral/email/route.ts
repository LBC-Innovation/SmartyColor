import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { emailFriendInvite } from "@/server/friendInviteEmailService";

/** Email the caller's Share with a friend link: body { email, note? }. */
export async function POST(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const body = (await request.json().catch(() => ({}))) as { email?: unknown; note?: unknown };
  if (typeof body.email !== "string") return jsonError("email is required", 400);
  const result = await emailFriendInvite({
    user: auth.user,
    email: body.email,
    note: typeof body.note === "string" ? body.note : "",
  });
  const code = result.error?.code;
  if (code === "INVALID_EMAIL") return jsonError(result.error!.message, 400, code);
  if (code === "LIMIT") return jsonError(result.error!.message, 429, code);
  if (code === "UNAVAILABLE") return jsonError(result.error!.message, 503, code);
  return jsonResult(result, result.error ? 500 : 200);
}
