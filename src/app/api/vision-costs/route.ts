import { readVisionCostLogTail } from "@/lib/visionCost/log";
import {
  ensureVisionCostSession,
  getVisionCostSessionSnapshot,
} from "@/lib/visionCost/session";
import { loadPersistedSummary } from "@/lib/visionCost/store";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";

export const dynamic = "force-dynamic";

/** Admin-only: durable totals from the database plus this instance's in-memory session. */
export async function GET(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!auth.user.permissions.includes("costs:viewai")) return Response.json({ error: "Forbidden" }, { status: 403 });

  await ensureVisionCostSession();
  const [snapshot, logTail, persisted] = await Promise.all([
    Promise.resolve(getVisionCostSessionSnapshot()),
    readVisionCostLogTail(),
    loadPersistedSummary(),
  ]);

  return Response.json({ ...snapshot, logTail, persisted });
}
