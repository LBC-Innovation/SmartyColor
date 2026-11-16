import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { getGuestCalls, getGuestCostsReport } from "@/server/guestCostsService";

export const dynamic = "force-dynamic";

/** What guests' AI calls cost, by address and country; ?ip=<address> lists that address's calls. */
export async function GET(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!auth.user.permissions.includes("costs:viewai")) {
    return jsonError("Missing required permission: costs:viewai", 403);
  }

  const ip = new URL(request.url).searchParams.get("ip")?.trim();
  if (ip) {
    if (ip.length > 64) return jsonError("ip is too long", 400);
    const calls = await getGuestCalls(ip);
    return jsonResult(calls, calls.error ? 500 : 200);
  }
  const report = await getGuestCostsReport();
  return jsonResult(report, report.error ? 500 : 200);
}
