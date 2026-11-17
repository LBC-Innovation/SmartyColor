import { jsonError, jsonResult } from "@/lib/api/respond";
import { requirePermission } from "@/lib/auth/guards";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import * as admin from "@/server/adminUsersService";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  const body = (await request.json()) as { email?: string };
  const email = body.email ?? "";

  // Changing your own verified email goes through Supabase's confirm-the-new-address flow,
  // so a stolen session can't quietly move the account to another inbox.
  if (auth.user.id === id && auth.user.emailVerified) {
    const token = request.headers.get("authorization")?.slice(7) ?? "";
    const result = await admin.requestOwnEmailChange(token, email, auth.user.email);
    if (result.error) return jsonResult(result, 400);
    return jsonResult(result);
  }

  // Your own unverified email (you never proved the old one), or an admin editing someone else.
  if (auth.user.id !== id && !requirePermission(auth.user, "usermanage:changeemail")) {
    return jsonError("Missing required permission: usermanage:changeemail", 403);
  }
  const result = await admin.updateUserEmail(id, email, auth.user.id);
  if (result.error) return jsonResult(result, 400);
  return jsonResult(result);
}
