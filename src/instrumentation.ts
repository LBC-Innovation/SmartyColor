export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;

  const { ensureVisionCostSession } = await import("@/lib/visionCost/session");
  await ensureVisionCostSession();
}
