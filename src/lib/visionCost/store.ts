import "server-only";
import { getSupabaseAdmin, getSupabaseAuth } from "@/lib/supabase/service";
import { supabaseServiceConfigured } from "@/lib/supabase/authServerConfig";
import type { VisionErrorEvent, VisionUsageEvent } from "@/lib/visionCost/types";

/**
 * Durable copy of vision usage/errors. The in-memory session is per server
 * instance and vanishes between serverless invocations; this is what the
 * admin page reads.
 */

const INSTANCE_ID = crypto.randomUUID().slice(0, 8);

function ready(): boolean {
  try {
    return supabaseServiceConfigured();
  } catch {
    return false;
  }
}

export async function persistUsageEvent(
  event: VisionUsageEvent & { imageOutputTokens?: number; textOutputTokens?: number; rateSource?: string | null },
  userId: string | null,
): Promise<void> {
  if (!ready()) return;
  const { error } = await getSupabaseAdmin().from("vision_usage_events").insert({
    id: event.id,
    at: event.at,
    user_id: userId,
    operation: event.operation,
    model_id: event.modelId,
    input_tokens: event.inputTokens,
    output_tokens: event.outputTokens,
    image_output_tokens: event.imageOutputTokens ?? (event.hasImageOutput ? event.outputTokens : 0),
    text_output_tokens: event.textOutputTokens ?? (event.hasImageOutput ? 0 : event.outputTokens),
    has_image_output: event.hasImageOutput,
    input_cost_usd: event.inputCostUsd,
    output_cost_usd: event.outputCostUsd,
    total_cost_usd: event.totalCostUsd,
    rate_source: event.rateSource ?? null,
    instance_id: INSTANCE_ID,
  });
  if (error) console.error(JSON.stringify({ level: "warn", message: "vision usage persist failed", error: error.message }));
}

export async function persistErrorEvent(event: VisionErrorEvent, userId: string | null): Promise<void> {
  if (!ready()) return;
  const { error } = await getSupabaseAdmin().from("vision_error_events").insert({
    id: event.id,
    at: event.at,
    user_id: userId,
    operation: event.operation,
    model_id: event.modelId,
    kind: event.kind,
    http_status: event.httpStatus,
    message: event.message,
    instance_id: INSTANCE_ID,
  });
  if (error) console.error(JSON.stringify({ level: "warn", message: "vision error persist failed", error: error.message }));
}

export type VisionPeriodTotals = {
  callCount: number;
  errorCount: number;
  inputTokens: number;
  outputTokens: number;
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
};

export type VisionPersistedSummary = {
  available: boolean;
  periods: { today: VisionPeriodTotals; last7d: VisionPeriodTotals; last30d: VisionPeriodTotals; allTime: VisionPeriodTotals };
  byOperation: Array<{ operation: string; callCount: number; totalCostUsd: number }>;
  recentEvents: Array<VisionUsageEvent & { userId: string | null; userEmail: string | null; instanceId: string | null }>;
  recentErrors: Array<VisionErrorEvent & { userId: string | null; userEmail: string | null; instanceId: string | null }>;
};

const emptyTotals = (): VisionPeriodTotals => ({
  callCount: 0,
  errorCount: 0,
  inputTokens: 0,
  outputTokens: 0,
  inputCostUsd: 0,
  outputCostUsd: 0,
  totalCostUsd: 0,
});

export async function loadPersistedSummary(): Promise<VisionPersistedSummary> {
  const empty: VisionPersistedSummary = {
    available: false,
    periods: { today: emptyTotals(), last7d: emptyTotals(), last30d: emptyTotals(), allTime: emptyTotals() },
    byOperation: [],
    recentEvents: [],
    recentErrors: [],
  };
  if (!ready()) return empty;

  const db = getSupabaseAdmin();
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();

  // Last 30 days of events in detail (enough to derive today/7d/30d); all-time via a separate aggregate.
  const [{ data: events, error: eErr }, { data: errors, error: xErr }, { data: allRows, error: aErr }] =
    await Promise.all([
      db.from("vision_usage_events").select("*").gte("at", since30).order("at", { ascending: false }).limit(5000),
      db.from("vision_error_events").select("*").order("at", { ascending: false }).limit(100),
      db.from("vision_usage_events").select("input_tokens, output_tokens, input_cost_usd, output_cost_usd, total_cost_usd"),
    ]);
  if (eErr || xErr || aErr) {
    console.error(JSON.stringify({ level: "warn", message: "vision summary load failed", error: (eErr ?? xErr ?? aErr)?.message }));
    return empty;
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const since7 = Date.now() - 7 * 86_400_000;

  const periods = { today: emptyTotals(), last7d: emptyTotals(), last30d: emptyTotals(), allTime: emptyTotals() };
  const byOp = new Map<string, { callCount: number; totalCostUsd: number }>();

  const add = (t: VisionPeriodTotals, r: Record<string, unknown>) => {
    t.callCount += 1;
    t.inputTokens += Number(r.input_tokens ?? 0);
    t.outputTokens += Number(r.output_tokens ?? 0);
    t.inputCostUsd += Number(r.input_cost_usd ?? 0);
    t.outputCostUsd += Number(r.output_cost_usd ?? 0);
    t.totalCostUsd += Number(r.total_cost_usd ?? 0);
  };
  for (const r of events ?? []) {
    const at = new Date(r.at as string).getTime();
    add(periods.last30d, r);
    if (at >= since7) add(periods.last7d, r);
    if (at >= startOfToday.getTime()) add(periods.today, r);
    const op = r.operation as string;
    const cur = byOp.get(op) ?? { callCount: 0, totalCostUsd: 0 };
    cur.callCount += 1;
    cur.totalCostUsd += Number(r.total_cost_usd ?? 0);
    byOp.set(op, cur);
  }
  for (const r of allRows ?? []) add(periods.allTime, r);

  for (const x of errors ?? []) {
    const at = new Date(x.at as string).getTime();
    periods.allTime.errorCount += 1;
    if (at >= new Date(since30).getTime()) periods.last30d.errorCount += 1;
    if (at >= since7) periods.last7d.errorCount += 1;
    if (at >= startOfToday.getTime()) periods.today.errorCount += 1;
  }

  const recentEventRows = (events ?? []).slice(0, 200);
  const userIds = [
    ...new Set(
      [...recentEventRows, ...(errors ?? [])]
        .map((r) => r.user_id as string | null)
        .filter((v): v is string => !!v),
    ),
  ];
  const emails = new Map<string, string>();
  await Promise.all(
    userIds.map(async (id) => {
      // Best effort: a row still shows without its user's email.
      const { data: u } = await getSupabaseAuth().auth.admin.getUserById(id).catch(() => ({ data: null }));
      if (u?.user?.email) emails.set(id, u.user.email);
    }),
  );
  const emailFor = (r: Record<string, unknown>) => (r.user_id ? (emails.get(r.user_id as string) ?? null) : null);

  const toEvent = (r: Record<string, unknown>) => ({
    id: r.id as string,
    at: r.at as string,
    operation: r.operation as VisionUsageEvent["operation"],
    modelId: r.model_id as string,
    inputTokens: Number(r.input_tokens ?? 0),
    outputTokens: Number(r.output_tokens ?? 0),
    inputCostUsd: Number(r.input_cost_usd ?? 0),
    outputCostUsd: Number(r.output_cost_usd ?? 0),
    totalCostUsd: Number(r.total_cost_usd ?? 0),
    hasImageOutput: Boolean(r.has_image_output),
    userId: (r.user_id as string | null) ?? null,
    userEmail: emailFor(r),
    instanceId: (r.instance_id as string | null) ?? null,
  });

  return {
    available: true,
    periods,
    byOperation: [...byOp.entries()]
      .map(([operation, v]) => ({ operation, ...v }))
      .sort((a, b) => b.totalCostUsd - a.totalCostUsd),
    recentEvents: recentEventRows.map(toEvent),
    recentErrors: (errors ?? []).map((x) => ({
      id: x.id as string,
      at: x.at as string,
      operation: x.operation as VisionErrorEvent["operation"],
      modelId: x.model_id as string,
      kind: x.kind as VisionErrorEvent["kind"],
      httpStatus: (x.http_status as number | null) ?? null,
      message: x.message as string,
      userId: (x.user_id as string | null) ?? null,
      userEmail: emailFor(x),
      instanceId: (x.instance_id as string | null) ?? null,
    })),
  };
}
