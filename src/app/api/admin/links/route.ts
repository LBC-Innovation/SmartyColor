import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { createLink, listLinks } from "@/server/marketing/acquisitionService";

export const dynamic = "force-dynamic";

/** Short campaign links (/go/<slug>) and their clicks. */
export async function GET(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!auth.user.permissions.includes("finance:view")) return jsonError("Missing required permission: finance:view", 403);
  const result = await listLinks();
  return jsonResult(result, result.error ? 500 : 200);
}

export async function POST(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!auth.user.permissions.includes("finance:manage")) return jsonError("Missing required permission: finance:manage", 403);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return jsonError("Invalid body", 400);
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
  const result = await createLink(auth.user.id, {
    slug: str("slug"),
    destination: str("destination"),
    utmSource: str("utmSource"),
    utmMedium: str("utmMedium"),
    utmCampaign: str("utmCampaign"),
    utmContent: str("utmContent") || null,
    promoNote: str("promoNote") || null,
  });
  return jsonResult(result, result.error ? 400 : 201);
}
