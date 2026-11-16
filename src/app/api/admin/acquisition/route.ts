import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { getAcquisitionReport } from "@/server/marketing/acquisitionService";

export const dynamic = "force-dynamic";

const PERIODS = new Set(["7", "30", "90", "365", "all"]);

/** Where customers came from: ?days=7|30|90|365|all, ?model=first|last. */
export async function GET(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!auth.user.permissions.includes("finance:view")) {
    return jsonError("Missing required permission: finance:view", 403);
  }
  const params = new URL(request.url).searchParams;
  const period = params.get("days") ?? "30";
  if (!PERIODS.has(period)) return jsonError("days must be 7, 30, 90, 365 or all", 400);
  const model = params.get("model") === "last" ? "last" : "first";
  const report = await getAcquisitionReport({ days: period === "all" ? null : Number(period), model });
  return jsonResult(report, report.error ? 500 : 200);
}
