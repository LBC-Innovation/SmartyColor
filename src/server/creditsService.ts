import type { ApiResult } from "@/lib/api/types";
import type { CreditLedgerEntry } from "@/lib/credits/types";
import { parseDollarsToCents } from "@/lib/credits/money";
import { getSupabaseAdmin } from "@/lib/supabase/service";

const MAX_ABS_DELTA_CENTS = 500_00; // $500 per adjustment

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
}): Promise<ApiResult<{ creditsBalanceCents: number }>> {
  if (!Number.isInteger(input.delta) || input.delta === 0) {
    return { data: null, error: { message: "deltaCents must be a non-zero integer" } };
  }
  if (Math.abs(input.delta) > MAX_ABS_DELTA_CENTS) {
    return {
      data: null,
      error: { message: `adjustment must be between -$${MAX_ABS_DELTA_CENTS / 100} and $${MAX_ABS_DELTA_CENTS / 100}` },
    };
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
      ? "User does not have enough wallet balance for that adjustment"
      : error.message.includes("profile not found")
        ? "User profile not found"
        : error.message;
    return { data: null, error: { message } };
  }

  const creditsBalanceCents = typeof data === "number" ? data : Number(data);
  log("info", "Admin adjusted promo wallet", {
    adminId: input.adminId,
    targetId: input.userId,
    deltaCents: input.delta,
    creditsBalanceCents,
  });

  return { data: { creditsBalanceCents }, error: null };
}

export function resolveCreditDeltaCents(body: {
  deltaCents?: unknown;
  delta?: unknown;
  amountDollars?: unknown;
}): number | { error: string } {
  if (body.deltaCents !== undefined) {
    if (typeof body.deltaCents !== "number" || !Number.isInteger(body.deltaCents)) {
      return { error: "deltaCents must be an integer" };
    }
    return body.deltaCents;
  }
  if (body.delta !== undefined) {
    if (typeof body.delta !== "number" || !Number.isInteger(body.delta)) {
      return { error: "deltaCents must be an integer" };
    }
    return body.delta;
  }
  if (body.amountDollars !== undefined) {
    if (typeof body.amountDollars === "number") {
      if (!Number.isFinite(body.amountDollars)) return { error: "amountDollars must be a finite number" };
      return Math.round(body.amountDollars * 100);
    }
    if (typeof body.amountDollars === "string") {
      const cents = parseDollarsToCents(body.amountDollars);
      if (cents === null) return { error: "amountDollars must be a valid dollar amount" };
      return cents;
    }
    return { error: "amountDollars must be a string or number" };
  }
  return { error: "deltaCents or amountDollars is required" };
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
