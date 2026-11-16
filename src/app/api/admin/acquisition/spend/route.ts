import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { deleteSpend, listSpend, saveSpend } from "@/server/marketing/acquisitionService";

export const dynamic = "force-dynamic";

async function authorize(request: Request, permission: "finance:view" | "finance:manage") {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth;
  if (!auth.user.permissions.includes(permission)) {
    return { error: jsonError(`Missing required permission: ${permission}`, 403) };
  }
  return auth;
}

/** Ad spend entered per month and channel. */
export async function GET(request: Request) {
  const auth = await authorize(request, "finance:view");
  if ("error" in auth) return auth.error;
  const result = await listSpend();
  return jsonResult(result, result.error ? 500 : 200);
}

/** Add or replace one month's spend for a channel (and optional source/campaign). */
export async function POST(request: Request) {
  const auth = await authorize(request, "finance:manage");
  if ("error" in auth) return auth.error;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("Invalid body", 400);
  const result = await saveSpend(auth.user.id, {
    month: String(body.month ?? ""),
    channel: String(body.channel ?? ""),
    source: typeof body.source === "string" ? body.source : "",
    campaign: typeof body.campaign === "string" ? body.campaign : "",
    amountCents: Number(body.amountCents),
    note: typeof body.note === "string" ? body.note : null,
  });
  return jsonResult(result, result.error ? 400 : 200);
}

export async function DELETE(request: Request) {
  const auth = await authorize(request, "finance:manage");
  if ("error" in auth) return auth.error;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError("id is required", 400);
  const result = await deleteSpend(id);
  return jsonResult(result, result.error ? 500 : 200);
}
