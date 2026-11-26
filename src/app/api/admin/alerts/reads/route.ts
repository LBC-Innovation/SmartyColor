import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { ADMIN_PERMISSIONS } from "@/components/v2/nav-config";
import { listAlertReads, markAlertsRead, markAlertUnread, validAlertKey } from "@/server/adminAlertReadsService";

export const dynamic = "force-dynamic";

/** Anyone who can open the admin area keeps their own read marks. */
async function adminUser(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth;
  if (!ADMIN_PERMISSIONS.some((p) => auth.user.permissions.includes(p))) return { error: jsonError("Admins only", 403) } as const;
  return auth;
}

/** The alert keys this admin has marked read. */
export async function GET(request: Request) {
  const auth = await adminUser(request);
  if ("error" in auth) return auth.error;
  const result = await listAlertReads(auth.user.id);
  return jsonResult(result, result.error ? 500 : 200);
}

/** Mark alerts read. Body: { keys: string[] }. */
export async function POST(request: Request) {
  const auth = await adminUser(request);
  if ("error" in auth) return auth.error;
  const body = (await request.json().catch(() => null)) as { keys?: unknown } | null;
  const keys = Array.isArray(body?.keys) ? body.keys : null;
  if (!keys || keys.length > 200 || !keys.every(validAlertKey)) return jsonError("keys must be a list of alert keys", 400);
  const result = await markAlertsRead(auth.user.id, [...new Set(keys)]);
  return jsonResult(result, result.error ? 500 : 200);
}

/** Mark one alert unread again. Body: { key: string }. */
export async function DELETE(request: Request) {
  const auth = await adminUser(request);
  if ("error" in auth) return auth.error;
  const body = (await request.json().catch(() => null)) as { key?: unknown } | null;
  if (!validAlertKey(body?.key)) return jsonError("key is required", 400);
  const result = await markAlertUnread(auth.user.id, body.key);
  return jsonResult(result, result.error ? 500 : 200);
}
