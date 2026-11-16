import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { FILES_PAGE_PERMISSIONS } from "@/lib/files/permissions";
import { getFilesReport } from "@/server/filesReportService";

export const dynamic = "force-dynamic";

/**
 * Stored files and the upload/delete log. ?days=30|90 limits the totals and the log to that many
 * days (default 30; "all" for all time); ?thumbs=1 includes thumbnails in the log.
 */
export async function GET(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!FILES_PAGE_PERMISSIONS.some((p) => auth.user.permissions.includes(p))) {
    return jsonError(`Missing required permission: ${FILES_PAGE_PERMISSIONS.join(" or ")}`, 403);
  }

  const params = new URL(request.url).searchParams;
  const daysParam = params.get("days") ?? "30";
  const periodDays = daysParam === "all" ? null : Number(daysParam);
  if (periodDays != null && (!Number.isInteger(periodDays) || periodDays < 1 || periodDays > 3650)) {
    return jsonError("days must be a whole number of days, or all", 400);
  }
  const report = await getFilesReport({ periodDays, includeThumbnails: params.get("thumbs") === "1" });
  return jsonResult(report, report.error ? (report.error.code === "MIGRATION_PENDING" ? 503 : 500) : 200);
}
