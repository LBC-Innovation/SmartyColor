import { jsonError, jsonResult } from "@/lib/api/respond";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { INSUFFICIENT_CREDITS_CODE } from "@/lib/credits/pricing";
import { createDigitalBookOrder } from "@/server/digitalBookService";

/** Buy a print-at-home book: charges the wallet and creates the paid order. */
export async function POST(request: Request) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;

  const body = (await request.json()) as { projectTitle?: string; pages?: unknown };
  const result = await createDigitalBookOrder({
    userId: auth.user.id,
    contactEmail: auth.user.email,
    projectTitle: body.projectTitle?.trim() || "My coloring book",
    pages: body.pages,
  });

  const code = result.error?.code;
  if (code === INSUFFICIENT_CREDITS_CODE) return jsonError(result.error!.message, 402, code);
  if (code === "INVALID_PAGES") return jsonError(result.error!.message, 400, code);
  if (code === "NOT_FOUND") return jsonError(result.error!.message, 404, code);
  return jsonResult(result, result.error ? 500 : 201);
}
