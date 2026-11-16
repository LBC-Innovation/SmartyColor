import "server-only";
import type { ApiResult } from "@/lib/api/types";
import type { GuestCall, GuestCostsReport, GuestCostTotals, GuestIpRow } from "@/lib/guests/types";
import { getSupabaseAdmin } from "@/lib/supabase/service";

/**
 * What people without an account cost, from vision_usage_events rows with no user. Guest rows carry
 * the visitor's address and location from migration 0033 on; older rows (and rows of deleted
 * accounts) are reported as unattributed.
 */

type GuestCostRow = {
  guest_ip: string | null;
  calls: number | string;
  cost_usd: number | string;
  first_at: string;
  last_at: string;
  geo_country: string | null;
  geo_region: string | null;
  geo_city: string | null;
  geo_postal: string | null;
  geo_latitude: number | string | null;
  geo_longitude: number | string | null;
};

const DAY_MS = 86_400_000;

function num(value: number | string | null): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toIpRow(r: GuestCostRow): GuestIpRow {
  return {
    ip: r.guest_ip as string,
    calls: Number(r.calls),
    costUsd: Number(r.cost_usd),
    firstAt: r.first_at,
    lastAt: r.last_at,
    country: r.geo_country,
    region: r.geo_region,
    city: r.geo_city,
    postal: r.geo_postal,
    latitude: num(r.geo_latitude),
    longitude: num(r.geo_longitude),
  };
}

function totals(rows: GuestCostRow[]): GuestCostTotals {
  return {
    calls: rows.reduce((s, r) => s + Number(r.calls), 0),
    costUsd: rows.reduce((s, r) => s + Number(r.cost_usd), 0),
    ips: rows.filter((r) => r.guest_ip != null).length,
  };
}

/** Before 0033 there are no guest columns: count every no-account call as unattributed. */
async function untrackedReport(): Promise<ApiResult<GuestCostsReport>> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("vision_usage_events")
    .select("at, total_cost_usd")
    .is("user_id", null)
    .order("at", { ascending: true })
    .limit(20_000);
  if (error) return { data: null, error: { message: error.message } };
  const rows = data ?? [];
  const since30 = Date.now() - 30 * DAY_MS;
  const recent = rows.filter((r) => new Date(r.at as string).getTime() >= since30);
  const sum = (list: typeof rows) => list.reduce((s, r) => s + Number(r.total_cost_usd ?? 0), 0);
  return {
    data: {
      tracking: false,
      allTime: { calls: rows.length, costUsd: sum(rows), ips: 0 },
      last30d: { calls: recent.length, costUsd: sum(recent), ips: 0 },
      daily: dailySeries(rows.map((r) => ({ at: r.at as string, cost: Number(r.total_cost_usd ?? 0) }))),
      byIp: [],
      byCountry: [],
      unattributed: rows.length
        ? { calls: rows.length, costUsd: sum(rows), firstAt: rows[0].at as string, lastAt: rows[rows.length - 1].at as string }
        : null,
    },
    error: null,
  };
}

function dailySeries(events: Array<{ at: string; cost: number }>): GuestCostsReport["daily"] {
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Array.from({ length: 30 }, (_, i) => ({
    date: new Date(todayUtc - (29 - i) * DAY_MS).toISOString().slice(0, 10),
    costUsd: 0,
    calls: 0,
  }));
  const index = new Map(days.map((d, i) => [d.date, i]));
  for (const e of events) {
    const i = index.get(e.at.slice(0, 10));
    if (i == null) continue;
    days[i].costUsd += e.cost;
    days[i].calls += 1;
  }
  return days;
}

function isMissingSchema(message: string): boolean {
  return /does not exist|could not find the function|schema cache/i.test(message);
}

export async function getGuestCostsReport(): Promise<ApiResult<GuestCostsReport>> {
  const db = getSupabaseAdmin();
  const since30 = new Date(Date.now() - 30 * DAY_MS).toISOString();
  const [all, recent, events] = await Promise.all([
    db.rpc("admin_guest_costs"),
    db.rpc("admin_guest_costs", { p_from: since30 }),
    db.from("vision_usage_events").select("at, total_cost_usd").is("user_id", null).gte("at", since30).limit(20_000),
  ]);
  const error = all.error ?? recent.error ?? events.error;
  if (error) {
    if (isMissingSchema(error.message)) return untrackedReport();
    return { data: null, error: { message: error.message } };
  }

  const allRows = (all.data ?? []) as GuestCostRow[];
  const recentRows = (recent.data ?? []) as GuestCostRow[];
  const byIp = allRows.filter((r) => r.guest_ip != null).map(toIpRow);
  const none = allRows.find((r) => r.guest_ip == null);

  const countries = new Map<string, { country: string | null; calls: number; costUsd: number; ips: number }>();
  for (const row of byIp) {
    const key = row.country ?? "";
    const cur = countries.get(key) ?? { country: row.country, calls: 0, costUsd: 0, ips: 0 };
    cur.calls += row.calls;
    cur.costUsd += row.costUsd;
    cur.ips += 1;
    countries.set(key, cur);
  }

  return {
    data: {
      tracking: true,
      allTime: totals(allRows),
      last30d: totals(recentRows),
      daily: dailySeries((events.data ?? []).map((r) => ({ at: r.at as string, cost: Number(r.total_cost_usd ?? 0) }))),
      byIp: byIp.sort((a, b) => b.costUsd - a.costUsd),
      byCountry: [...countries.values()].sort((a, b) => b.costUsd - a.costUsd),
      unattributed: none
        ? { calls: Number(none.calls), costUsd: Number(none.cost_usd), firstAt: none.first_at, lastAt: none.last_at }
        : null,
    },
    error: null,
  };
}

/** Every AI call from one guest address, newest first. */
export async function getGuestCalls(ip: string): Promise<ApiResult<GuestCall[]>> {
  const { data, error } = await getSupabaseAdmin()
    .from("vision_usage_events")
    .select("id, at, operation, model_id, total_cost_usd, geo_country, geo_region, geo_city")
    .is("user_id", null)
    .eq("guest_ip", ip)
    .order("at", { ascending: false })
    .limit(500);
  if (error) return { data: null, error: { message: error.message } };
  return {
    data: (data ?? []).map((r) => ({
      id: r.id as string,
      at: r.at as string,
      operation: r.operation as string,
      modelId: r.model_id as string,
      costUsd: Number(r.total_cost_usd ?? 0),
      country: (r.geo_country as string | null) ?? null,
      region: (r.geo_region as string | null) ?? null,
      city: (r.geo_city as string | null) ?? null,
    })),
    error: null,
  };
}
