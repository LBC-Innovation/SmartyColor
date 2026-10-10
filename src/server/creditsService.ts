import type { ApiResult } from "@/lib/api/types";
import type { CreditLedgerEntry } from "@/lib/credits/types";
import { getSupabaseAdmin } from "@/lib/supabase/service";

export type { CreditLedgerEntry } from "@/lib/credits/types";

function log(level: string, message: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, message, ...ctx }));
}

export async function adjustUserCredits(input: {
  userId: string;
  delta: number;
  adminId: string;
  note?: string;
  reason?: string;
}): Promise<ApiResult<{ creditsBalance: number }>> {
  if (!Number.isInteger(input.delta) || input.delta === 0) {
    return { data: null, error: { message: "delta must be a non-zero integer" } };
  }
  if (input.delta > 1000 || input.delta < -1000) {
    return { data: null, error: { message: "delta must be between -1000 and 1000" } };
  }

  const { data, error } = await getSupabaseAdmin().rpc("admin_adjust_user_credits", {
    p_user_id: input.userId,
    p_delta: input.delta,
    p_created_by: input.adminId,
    p_note: input.note?.trim() || null,
    p_reason: input.reason?.trim() || "admin_grant",
  });

  if (error) {
    const message = error.message.includes("insufficient credits")
      ? "User does not have enough credits for that adjustment"
      : error.message.includes("profile not found")
        ? "User profile not found"
        : error.message;
    return { data: null, error: { message } };
  }

  const creditsBalance = typeof data === "number" ? data : Number(data);
  log("info", "Admin adjusted user credits", {
    adminId: input.adminId,
    targetId: input.userId,
    delta: input.delta,
    creditsBalance,
  });

  return { data: { creditsBalance }, error: null };
}

export async function listCreditLedgerForUser(
  userId: string,
  limit = 20,
): Promise<ApiResult<CreditLedgerEntry[]>> {
  const { data, error } = await getSupabaseAdmin()
    .from("credit_ledger")
    .select("id, delta, balance_after, reason, note, created_at, created_by")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { data: null, error: { message: error.message } };
  }

  return {
    data: (data ?? []).map((row) => ({
      id: row.id as string,
      delta: row.delta as number,
      balanceAfter: row.balance_after as number,
      reason: row.reason as string,
      note: (row.note as string | null) ?? null,
      createdAt: row.created_at as string,
      createdBy: (row.created_by as string | null) ?? null,
    })),
    error: null,
  };
}
