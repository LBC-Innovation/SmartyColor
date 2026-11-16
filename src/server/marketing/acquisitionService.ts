import "server-only";
import type { ApiResult } from "@/lib/api/types";
import { clientOrigin } from "@/lib/auth/clientOrigin";
import type {
  AcquisitionDay,
  AcquisitionReport,
  AttributionModel,
  ChannelRow,
  HeardFromRow,
  MarketingLink,
  MarketingLinkInput,
  ReferrerRow,
  SourceRow,
  SpendEntry,
} from "@/lib/marketing/acquisitionTypes";
import { attributionFromJson, type AttributionTouch } from "@/lib/marketing/attribution";
import { CHANNELS, classifyChannel, sourceName, type Channel } from "@/lib/marketing/channel";
import { getSupabaseAdmin } from "@/lib/supabase/service";

/**
 * Where customers come from and what they're worth (/admin/acquisition), the ad spend entered
 * against it, and the short campaign links (/admin/links).
 *
 * Each account is credited to one channel: its first recorded visit (default) or its last one
 * before sign-up, from profiles.attribution, falling back to its first order's attribution. Every
 * paid order counts toward its buyer's channel. Spend is entered per month, so a period counts
 * every month it touches in full.
 */

type Row = Record<string, unknown>;
const err = (message: string, code?: string): ApiResult<never> => ({ data: null, error: { message, ...(code ? { code } : {}) } });

const DAY_MS = 86_400_000;
const PAGE = 1000;
const MAX_ROWS = 100_000;
/** Orders that don't count as revenue. */
const NOT_SOLD = new Set(["canceled", "refunded", "failed"]);

function db() {
  return getSupabaseAdmin();
}

function missingColumn(message: string | undefined): boolean {
  return Boolean(message && /column|schema cache|does not exist|relation/i.test(message));
}

/** Every row of a query, a page at a time. */
async function fetchAll(build: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function monthStart(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function emptyChannel(channel: Channel): ChannelRow {
  return { channel, signups: 0, newCustomers: 0, orders: 0, revenueCents: 0, spendCents: 0, guestAddresses: 0, guestAiCostUsd: 0 };
}

type Credit = { channel: Channel; source: string; campaign: string; ref: string | null; attributed: boolean };

function creditFor(touch: AttributionTouch | null): Credit {
  if (!touch) return { channel: "direct", source: "(none)", campaign: "", ref: null, attributed: false };
  return {
    channel: classifyChannel(touch),
    source: sourceName(touch),
    campaign: touch.utm_campaign ?? "",
    ref: touch.ref ? touch.ref.trim().toUpperCase() : null,
    attributed: true,
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function getAcquisitionReport(input: { days: number | null; model: AttributionModel }): Promise<ApiResult<AcquisitionReport>> {
  const now = Date.now();
  const toMs = now;
  const fromMs = input.days ? now - input.days * DAY_MS : Date.parse("2024-01-01T00:00:00Z");
  const fromIso = new Date(fromMs).toISOString();
  const toIso = new Date(toMs).toISOString();
  const inRange = (iso: string | null | undefined) => {
    if (!iso) return false;
    const t = Date.parse(iso);
    return t >= fromMs && t <= toMs;
  };

  try {
    // Survey columns arrive with 0036; read without them before that.
    let tracking = true;
    let profiles: Row[];
    try {
      profiles = await fetchAll((a, b) =>
        db()
          .from("profiles")
          .select("id, created_at, attribution, display_name, referral_code, heard_from, heard_from_detail")
          .order("created_at", { ascending: true })
          .range(a, b),
      );
    } catch (e) {
      if (!missingColumn(e instanceof Error ? e.message : "")) throw e;
      tracking = false;
      profiles = await fetchAll((a, b) =>
        db().from("profiles").select("id, created_at, attribution, display_name, referral_code").order("created_at", { ascending: true }).range(a, b),
      );
    }

    const orders = await fetchAll((a, b) =>
      db()
        .from("book_orders")
        .select("id, user_id, status, total_cents, paid_at, attribution")
        .not("paid_at", "is", null)
        .order("paid_at", { ascending: true })
        .range(a, b),
    );
    const sold = orders.filter((o) => !NOT_SOLD.has(o.status as string));

    // First paid order per account, and its attribution as a fallback.
    const firstOrder = new Map<string, Row>();
    for (const o of sold) {
      const uid = o.user_id as string;
      if (!firstOrder.has(uid)) firstOrder.set(uid, o);
    }

    // One credit per account.
    const credit = new Map<string, Credit>();
    for (const p of profiles) {
      const uid = p.id as string;
      const attr = attributionFromJson(p.attribution) ?? attributionFromJson(firstOrder.get(uid)?.attribution);
      const touch = attr ? (input.model === "first" ? attr.first : attr.last) : null;
      credit.set(uid, creditFor(touch));
    }
    const creditOf = (uid: string) => credit.get(uid) ?? creditFor(null);

    const channels = new Map<Channel, ChannelRow>(CHANNELS.map((c) => [c, emptyChannel(c)]));
    const sources = new Map<string, SourceRow>();
    const sourceRow = (c: Credit): SourceRow => {
      const key = `${c.channel}|${c.source}|${c.campaign}`;
      let row = sources.get(key);
      if (!row) {
        row = { channel: c.channel, source: c.source, campaign: c.campaign, signups: 0, newCustomers: 0, revenueCents: 0, spendCents: 0 };
        sources.set(key, row);
      }
      return row;
    };
    const daily = new Map<string, AcquisitionDay>();
    const dayRow = (iso: string): AcquisitionDay => {
      const key = dayKey(iso);
      let row = daily.get(key);
      if (!row) {
        row = { day: key, signups: 0, newCustomers: 0, revenueCents: 0 };
        daily.set(key, row);
      }
      return row;
    };

    let signups = 0;
    let unattributed = 0;
    for (const p of profiles) {
      if (!inRange(p.created_at as string)) continue;
      const c = creditOf(p.id as string);
      signups++;
      if (!c.attributed) unattributed++;
      channels.get(c.channel)!.signups++;
      sourceRow(c).signups++;
      dayRow(p.created_at as string).signups++;
    }

    let newCustomers = 0;
    const daysToFirst: number[] = [];
    const createdAt = new Map(profiles.map((p) => [p.id as string, p.created_at as string]));
    for (const [uid, o] of firstOrder) {
      if (!inRange(o.paid_at as string)) continue;
      const c = creditOf(uid);
      newCustomers++;
      channels.get(c.channel)!.newCustomers++;
      sourceRow(c).newCustomers++;
      dayRow(o.paid_at as string).newCustomers++;
      const signedUp = createdAt.get(uid);
      if (signedUp) daysToFirst.push(Math.max(0, (Date.parse(o.paid_at as string) - Date.parse(signedUp)) / DAY_MS));
    }

    let orderCount = 0;
    let revenue = 0;
    for (const o of sold) {
      if (!inRange(o.paid_at as string)) continue;
      const cents = (o.total_cents as number | null) ?? 0;
      const c = creditOf(o.user_id as string);
      orderCount++;
      revenue += cents;
      const ch = channels.get(c.channel)!;
      ch.orders++;
      ch.revenueCents += cents;
      sourceRow(c).revenueCents += cents;
      dayRow(o.paid_at as string).revenueCents += cents;
    }

    // Spend for every month the period touches.
    let spendTotal = 0;
    if (tracking) {
      const { data: spend, error: spendError } = await db()
        .from("marketing_spend")
        .select("channel, source, campaign, amount_cents")
        .gte("month", monthStart(new Date(fromMs)))
        .lte("month", monthStart(new Date(toMs)));
      if (spendError && !missingColumn(spendError.message)) throw new Error(spendError.message);
      if (spendError) tracking = false;
      for (const s of spend ?? []) {
        const channel = (CHANNELS as readonly string[]).includes(s.channel as string) ? (s.channel as Channel) : null;
        if (!channel) continue;
        const cents = s.amount_cents as number;
        spendTotal += cents;
        channels.get(channel)!.spendCents += cents;
        if (s.source) {
          sourceRow({ channel, source: s.source as string, campaign: (s.campaign as string) ?? "", ref: null, attributed: true }).spendCents += cents;
        }
      }
    }

    // Guests by channel.
    if (tracking) {
      try {
        const guestRows = await fetchAll((a, b) =>
          db()
            .from("vision_usage_events")
            .select("guest_ip, acq_channel, total_cost_usd")
            .is("user_id", null)
            .not("guest_ip", "is", null)
            .gte("at", fromIso)
            .lte("at", toIso)
            .range(a, b),
        );
        const ips = new Map<Channel, Set<string>>();
        for (const g of guestRows) {
          const raw = (g.acq_channel as string | null) ?? "direct";
          const channel = ((CHANNELS as readonly string[]).includes(raw) ? raw : "direct") as Channel;
          const row = channels.get(channel)!;
          row.guestAiCostUsd += Number(g.total_cost_usd ?? 0);
          let set = ips.get(channel);
          if (!set) ips.set(channel, (set = new Set()));
          set.add(g.guest_ip as string);
        }
        for (const [channel, set] of ips) channels.get(channel)!.guestAddresses = set.size;
      } catch (e) {
        if (!missingColumn(e instanceof Error ? e.message : "")) throw e;
        tracking = false;
      }
    }

    // Survey answers from accounts created in the period.
    const customers = new Set(firstOrder.keys());
    const heard = new Map<string, HeardFromRow>();
    let answered = 0;
    if (tracking) {
      for (const p of profiles) {
        const answer = p.heard_from as string | null;
        if (!answer || !inRange(p.created_at as string)) continue;
        if (answer !== "skipped") answered++;
        let row = heard.get(answer);
        if (!row) heard.set(answer, (row = { answer, count: 0, customers: 0, details: [] }));
        row.count++;
        if (customers.has(p.id as string)) row.customers++;
        const detail = (p.heard_from_detail as string | null)?.trim();
        if (detail && row.details.length < 15) row.details.push(detail);
      }
    }

    // Referrers: accounts whose code brought sign-ups in the period.
    const byCode = new Map<string, Row>();
    for (const p of profiles) if (p.referral_code) byCode.set((p.referral_code as string).toUpperCase(), p);
    const referrers = new Map<string, ReferrerRow>();
    for (const p of profiles) {
      if (!inRange(p.created_at as string)) continue;
      const attr = attributionFromJson(p.attribution);
      const code = (attr?.first.ref ?? attr?.last.ref)?.trim().toUpperCase();
      const owner = code ? byCode.get(code) : undefined;
      if (!owner || owner.id === p.id) continue;
      const ownerId = owner.id as string;
      let row = referrers.get(ownerId);
      if (!row) {
        row = {
          userId: ownerId,
          label: ((owner.display_name as string | null) ?? "").trim() || `Account ${code}`,
          code: code!,
          signups: 0,
          customers: 0,
          creditedCents: 0,
        };
        referrers.set(ownerId, row);
      }
      row.signups++;
      if (customers.has(p.id as string)) row.customers++;
    }
    const { data: credits } = await db()
      .from("referral_credits")
      .select("referrer_id, amount_cents, created_at")
      .gte("created_at", fromIso)
      .lte("created_at", toIso);
    for (const c of credits ?? []) {
      const row = referrers.get(c.referrer_id as string);
      if (row) row.creditedCents += (c.amount_cents as number) ?? 0;
    }

    // Fill empty days so the chart has a continuous axis (up to a year).
    const days: AcquisitionDay[] = [];
    const span = Math.min(366, Math.ceil((toMs - Math.max(fromMs, toMs - 366 * DAY_MS)) / DAY_MS));
    for (let i = span - 1; i >= 0; i--) {
      const key = dayKey(new Date(toMs - i * DAY_MS).toISOString());
      days.push(daily.get(key) ?? { day: key, signups: 0, newCustomers: 0, revenueCents: 0 });
    }

    return {
      data: {
        from: fromIso,
        to: toIso,
        model: input.model,
        totals: {
          signups,
          newCustomers,
          orders: orderCount,
          revenueCents: revenue,
          spendCents: spendTotal,
          unattributedSignups: unattributed,
          medianDaysToFirstOrder: median(daysToFirst),
          heardFromAnswered: answered,
        },
        channels: [...channels.values()].filter(
          (c) => c.signups || c.newCustomers || c.orders || c.spendCents || c.guestAddresses,
        ),
        sources: [...sources.values()]
          .filter((s) => s.signups || s.newCustomers || s.revenueCents || s.spendCents)
          .sort((a, b) => b.revenueCents - a.revenueCents || b.signups - a.signups)
          .slice(0, 200),
        heardFrom: [...heard.values()].sort((a, b) => b.count - a.count),
        referrers: [...referrers.values()].sort((a, b) => b.customers - a.customers || b.signups - a.signups).slice(0, 50),
        daily: days,
        tracking,
      },
      error: null,
    };
  } catch (e) {
    return err(e instanceof Error ? e.message : "Could not build the acquisition report");
  }
}

// --- Spend ---------------------------------------------------------------------------------------

function spendFromRow(r: Row): SpendEntry {
  return {
    id: r.id as string,
    month: r.month as string,
    channel: r.channel as Channel,
    source: (r.source as string) ?? "",
    campaign: (r.campaign as string) ?? "",
    amountCents: r.amount_cents as number,
    note: (r.note as string | null) ?? null,
    updatedAt: r.updated_at as string,
  };
}

export async function listSpend(): Promise<ApiResult<SpendEntry[]>> {
  const { data, error } = await db().from("marketing_spend").select("*").order("month", { ascending: false }).limit(500);
  if (error) return err(missingColumn(error.message) ? "Apply database migration 0036 to record ad spend." : error.message);
  return { data: (data ?? []).map(spendFromRow), error: null };
}

const TEXT = /^[\w .:/+-]{0,120}$/;

export async function saveSpend(
  userId: string,
  input: { month: string; channel: string; source?: string; campaign?: string; amountCents: number; note?: string | null },
): Promise<ApiResult<SpendEntry>> {
  const month = /^\d{4}-\d{2}$/.test(input.month) ? `${input.month}-01` : /^\d{4}-\d{2}-01$/.test(input.month) ? input.month : null;
  if (!month) return err("Pick a month.", "INVALID");
  if (!(CHANNELS as readonly string[]).includes(input.channel)) return err("Pick a channel.", "INVALID");
  const source = (input.source ?? "").trim().toLowerCase();
  const campaign = (input.campaign ?? "").trim();
  if (!TEXT.test(source) || !TEXT.test(campaign)) return err("Source and campaign may use letters, numbers, spaces and - _ . : / +", "INVALID");
  if (!Number.isInteger(input.amountCents) || input.amountCents < 0 || input.amountCents > 100_000_000) return err("Enter an amount.", "INVALID");
  const note = input.note?.trim().slice(0, 300) || null;

  const { data, error } = await db()
    .from("marketing_spend")
    .upsert(
      { month, channel: input.channel, source, campaign, amount_cents: input.amountCents, note, created_by: userId, updated_at: new Date().toISOString() },
      { onConflict: "month,channel,source,campaign" },
    )
    .select("*")
    .single();
  if (error || !data) return err(error?.message ?? "Could not save the spend");
  return { data: spendFromRow(data), error: null };
}

export async function deleteSpend(id: string): Promise<ApiResult<{ deleted: boolean }>> {
  const { error } = await db().from("marketing_spend").delete().eq("id", id);
  if (error) return err(error.message);
  return { data: { deleted: true }, error: null };
}

// --- Campaign links ------------------------------------------------------------------------------

function linkFromRow(r: Row): MarketingLink {
  return {
    id: r.id as string,
    slug: r.slug as string,
    url: `${clientOrigin()}/go/${r.slug as string}`,
    destination: r.destination as string,
    utmSource: r.utm_source as string,
    utmMedium: r.utm_medium as string,
    utmCampaign: r.utm_campaign as string,
    utmContent: (r.utm_content as string | null) ?? null,
    promoNote: (r.promo_note as string | null) ?? null,
    clicks: (r.clicks as number) ?? 0,
    lastClickAt: (r.last_click_at as string | null) ?? null,
    archived: Boolean(r.archived_at),
    createdAt: r.created_at as string,
  };
}

export async function listLinks(): Promise<ApiResult<MarketingLink[]>> {
  const { data, error } = await db().from("marketing_links").select("*").order("created_at", { ascending: false }).limit(500);
  if (error) return err(missingColumn(error.message) ? "Apply database migration 0036 to create campaign links." : error.message);
  return { data: (data ?? []).map(linkFromRow), error: null };
}

const SLUG = /^[a-z0-9][a-z0-9-]{1,47}$/;
const TAG = /^[a-z0-9][a-z0-9_.-]{0,79}$/;

/** UTM values are kept lower-case with underscores so reports don't split "TikTok" and "tiktok". */
export function normalizeTag(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s]+/g, "_")
    .replace(/[^a-z0-9_.-]/g, "")
    .slice(0, 80);
}

export async function createLink(userId: string, input: MarketingLinkInput): Promise<ApiResult<MarketingLink>> {
  const slug = input.slug.trim().toLowerCase();
  if (!SLUG.test(slug)) return err("The short name needs 2–48 lower-case letters, numbers or dashes.", "INVALID");
  let destination = input.destination.trim() || "/";
  try {
    // Accept a full URL on this site and keep only its path.
    if (/^https?:\/\//i.test(destination)) {
      const u = new URL(destination);
      destination = `${u.pathname}${u.search}`;
    }
  } catch {
    return err("Enter a page on this site, like /gift.", "INVALID");
  }
  if (!destination.startsWith("/") || destination.startsWith("//")) return err("Enter a page on this site, like /gift.", "INVALID");
  const source = normalizeTag(input.utmSource);
  const medium = normalizeTag(input.utmMedium);
  const campaign = normalizeTag(input.utmCampaign);
  const content = input.utmContent ? normalizeTag(input.utmContent) : null;
  if (!TAG.test(source) || !TAG.test(medium) || !TAG.test(campaign)) return err("Source, medium and campaign are required.", "INVALID");

  const { data, error } = await db()
    .from("marketing_links")
    .insert({
      slug,
      destination: destination.slice(0, 300),
      utm_source: source,
      utm_medium: medium,
      utm_campaign: campaign,
      utm_content: content || null,
      promo_note: input.promoNote?.trim().slice(0, 300) || null,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error?.code === "23505") return err("That short name is taken.", "TAKEN");
  if (error || !data) return err(error?.message ?? "Could not create the link");
  return { data: linkFromRow(data), error: null };
}

export async function setLinkArchived(id: string, archived: boolean): Promise<ApiResult<MarketingLink>> {
  const { data, error } = await db()
    .from("marketing_links")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) return err(error?.message ?? "Link not found", error ? undefined : "NOT_FOUND");
  return { data: linkFromRow(data), error: null };
}
