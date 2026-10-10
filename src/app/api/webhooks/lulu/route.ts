import { jsonError, jsonResult } from "@/lib/api/respond";
import { verifyLuluWebhookHmac } from "@/server/lulu/webhooks";
import * as orders from "@/server/ordersService";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const hmac = request.headers.get("Lulu-HMAC-SHA256");

  if (!verifyLuluWebhookHmac(rawBody, hmac)) {
    return jsonError("Invalid webhook signature", 401);
  }

  let payload: { topic?: string; data?: { id?: number } };
  try {
    payload = JSON.parse(rawBody) as { topic?: string; data?: { id?: number } };
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  if (payload.topic === "PRINT_JOB_STATUS_CHANGED") {
    const printJobId = payload.data?.id;
    if (typeof printJobId !== "number") {
      return jsonError("Missing print job id", 400);
    }
    const result = await orders.applyLuluWebhookPrintJob(printJobId);
    if (result.error?.code === "NOT_FOUND") {
      return jsonResult({ data: { ignored: true }, error: null }, 200);
    }
    return jsonResult(result, result.error ? 500 : 200);
  }

  return jsonResult({ data: { ignored: true }, error: null }, 200);
}
