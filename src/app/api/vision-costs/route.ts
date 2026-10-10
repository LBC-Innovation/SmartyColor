import { readVisionCostLogTail } from "@/lib/visionCost/log";
import {
  ensureVisionCostSession,
  getVisionCostSessionSnapshot,
} from "@/lib/visionCost/session";

export const dynamic = "force-dynamic";

export async function GET() {
  await ensureVisionCostSession();
  const snapshot = getVisionCostSessionSnapshot();
  const logTail = await readVisionCostLogTail();

  return Response.json({ ...snapshot, logTail });
}
