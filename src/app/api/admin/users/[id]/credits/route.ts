import { jsonError, jsonResult } from "@/lib/api/respond";
import { requirePermission } from "@/lib/auth/guards";
import { requireAuthRequest } from "@/lib/auth/routeHelpers";
import { clientOrigin } from "@/lib/auth/clientOrigin";
import { getSupabaseAuth } from "@/lib/supabase/service";
import * as credits from "@/server/creditsService";
import { creditGrantEmail } from "@/server/email/creditGrantEmail";
import { sendEmail } from "@/server/email/resend";

type Params = { params: Promise<{ id: string }> };

function canAdjustCredits(role: string, permissions: string[]): boolean {
  return role === "admin" || permissions.includes("usermanage:adjustcredits");
}

export async function GET(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!canAdjustCredits(auth.user.role, auth.user.permissions)) {
    return jsonError("Missing required permission: usermanage:adjustcredits", 403);
  }

  const { id } = await params;
  const result = await credits.listCreditLedgerForUser(id);
  return jsonResult(result, result.error ? 500 : 200);
}

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAuthRequest(request);
  if ("error" in auth) return auth.error;
  if (!canAdjustCredits(auth.user.role, auth.user.permissions)) {
    return jsonError("Missing required permission: usermanage:adjustcredits", 403);
  }

  const { id } = await params;
  const body = (await request.json()) as {
    deltaCents?: unknown;
    delta?: unknown;
    amountDollars?: unknown;
    note?: unknown;
    notifyUser?: unknown;
    emailNote?: unknown;
  };
  const resolved = credits.resolveCreditDeltaCents(body);
  if (typeof resolved === "object" && "error" in resolved) {
    return jsonError(resolved.error, 400);
  }
  const note = typeof body.note === "string" ? body.note : undefined;

  const result = await credits.adjustUserCredits({
    userId: id,
    delta: resolved,
    adminId: auth.user.id,
    note,
  });

  if (result.error) {
    const status = result.error.message.includes("not found") ? 404 : 400;
    return jsonResult(result, status);
  }

  // Only a grant is worth an email; a failed send never undoes the adjustment.
  if (body.notifyUser !== true || resolved <= 0) return jsonResult(result);
  let emailSent = false;
  try {
    const { data } = await getSupabaseAuth().auth.admin.getUserById(id);
    const to = data.user?.email;
    if (to) {
      emailSent = await sendEmail(
        creditGrantEmail({
          to,
          amountCents: resolved,
          balanceCents: result.data.creditsBalanceCents,
          note: typeof body.emailNote === "string" ? body.emailNote : undefined,
          url: `${clientOrigin()}/studio`,
        }),
      );
    }
  } catch (e) {
    console.error(
      JSON.stringify({ level: "error", message: "credit grant email failed", targetId: id, error: String(e) }),
    );
  }
  return jsonResult({ data: { ...result.data, emailSent }, error: null });
}
