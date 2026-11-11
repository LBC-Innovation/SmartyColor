import "server-only";
import { createHmac } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/service";
import { supabaseServiceConfigured } from "@/lib/supabase/authServerConfig";
import { GUEST_GLOBAL_LIMIT_CODE, GUEST_LIMIT_CODE } from "@/lib/guestLimit";

/**
 * Daily limits for guests (no account) on routes that cost money or CPU. Needs the
 * guest_usage table and functions from supabase/migrations/0027_guest_usage.sql; until that is
 * applied, or if the database errors, every check passes ("fail open") and one warning is logged.
 */

export type GuestUsageKind = "page" | "edit" | "prepare";


function intFromEnv(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function limitFor(kind: GuestUsageKind): number {
  if (kind === "page") return intFromEnv("GUEST_DAILY_PAGES", 8);
  if (kind === "edit") return intFromEnv("GUEST_DAILY_EDITS", 15);
  return intFromEnv("GUEST_DAILY_PREPARES", 60);
}

/** The visitor's address as the platform saw it. Vercel overwrites x-vercel-forwarded-for, so it can't be spoofed there. */
function clientIp(request: Request): string {
  const h = request.headers;
  const vercel = h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (vercel) return vercel;
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** Expands an IPv6 address to 8 numeric groups, or null if it isn't one. */
function ipv6Groups(address: string): number[] | null {
  let text = address;
  // An embedded IPv4 tail ("::ffff:1.2.3.4") becomes two hex groups.
  const tail = text.match(/^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (tail) {
    const [a, b, c, d] = tail.slice(2).map(Number);
    if ([a, b, c, d].some((n) => n > 255)) return null;
    text = `${tail[1]}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string) => (part === "" ? [] : part.split(":"));
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 0) return null;
  const all = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  const nums = all.map((g) => (/^[0-9a-f]{1,4}$/i.test(g) ? Number.parseInt(g, 16) : Number.NaN));
  return nums.length === 8 && nums.every((n) => !Number.isNaN(n)) ? nums : null;
}

/**
 * What identifies a visitor for limits. IPv4 stays as is; IPv6 collapses to its /64 (one household or
 * device can hold billions of addresses in a /64); IPv4-mapped IPv6 counts as the IPv4 address.
 */
export function limitKeyForIp(raw: string): string {
  const ip = raw.trim().replace(/^\[|\]$/g, "").split("%")[0].toLowerCase();
  if (!ip.includes(":")) return ip;
  const groups = ipv6Groups(ip);
  if (!groups) return ip;
  const mapped = groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff;
  if (mapped) return `${groups[6] >> 8}.${groups[6] & 255}.${groups[7] >> 8}.${groups[7] & 255}`;
  return `v6/${groups.slice(0, 4).map((g) => g.toString(16)).join(":")}`;
}

function hashIp(ip: string): string {
  const secret = process.env.GUEST_USAGE_SALT?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY || "guest-usage";
  // Derived key so the service role key itself is never the HMAC key when no salt is set.
  const key = createHmac("sha256", "guest-usage-v1").update(secret).digest();
  return createHmac("sha256", key).update(ip).digest("hex");
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** While the table or functions are missing, skip the database for a few minutes instead of failing on every request. */
const MISSING_BACKOFF_MS = 5 * 60 * 1000;
let skipDbUntil = 0;

function isMissingSchema(message: string, code?: string): boolean {
  return (
    /does not exist|could not find the (table|function)|schema cache/i.test(message) ||
    code === "42P01" ||
    code === "42883" ||
    code === "PGRST202" ||
    code === "PGRST205"
  );
}

function noteDbError(error: { message: string; code?: string }): void {
  warnOnce(error.message);
  if (isMissingSchema(error.message, error.code)) skipDbUntil = Date.now() + MISSING_BACKOFF_MS;
}

let warned = false;
function warnOnce(message: string): void {
  if (warned) return;
  warned = true;
  console.warn(JSON.stringify({ level: "warn", message: `guest usage limit disabled: ${message}` }));
}

export type GuestUsageResult =
  | {
      allowed: true;
      /** Gives the attempt back (never below zero). Call it when the work failed, so the visitor keeps their page. */
      refund: () => Promise<void>;
    }
  | { allowed: false; scope: "ip" | "global" };

const NO_REFUND = async () => {};

/**
 * Call before the work starts. Counts the attempt when it is allowed. Over the limit returns
 * `allowed: false`; send guestLimitResponse(). Never throws.
 */
export async function checkGuestUsage(request: Request, kind: GuestUsageKind): Promise<GuestUsageResult> {
  const open: GuestUsageResult = { allowed: true, refund: NO_REFUND };
  if (!supabaseServiceConfigured() || Date.now() < skipDbUntil) return open;
  try {
    const db = getSupabaseAdmin();
    const day = today();

    if (kind === "page") {
      const globalLimit = intFromEnv("GUEST_DAILY_PAGES_GLOBAL", 2000);
      const total = await db.rpc("guest_usage_day_total", { p_day: day, p_kind: kind });
      if (total.error) {
        noteDbError(total.error);
        return open;
      }
      if (Number(total.data ?? 0) >= globalLimit) return { allowed: false, scope: "global" };
    }

    const limit = limitFor(kind);
    const ipHash = hashIp(limitKeyForIp(clientIp(request)));
    const used = await db.rpc("guest_usage_try_increment", {
      p_ip_hash: ipHash,
      p_day: day,
      p_kind: kind,
      p_limit: limit,
    });
    if (used.error) {
      noteDbError(used.error);
      return open;
    }
    if (Number(used.data) > limit) return { allowed: false, scope: "ip" };
    return {
      allowed: true,
      refund: async () => {
        try {
          await db.rpc("guest_usage_refund", { p_ip_hash: ipHash, p_day: day, p_kind: kind });
        } catch {
          /* a lost refund only costs the visitor one page */
        }
      },
    };
  } catch (error) {
    warnOnce(error instanceof Error ? error.message : "unknown error");
    return open;
  }
}

/** The 429 the browser turns into the "make a free account" card. */
export function guestLimitResponse(scope: "ip" | "global", kind: GuestUsageKind): Response {
  if (scope === "global") {
    return Response.json(
      {
        error: "We're very busy right now. Create a free account to keep going, or try again later.",
        code: GUEST_GLOBAL_LIMIT_CODE,
      },
      { status: 429 },
    );
  }
  const what = kind === "edit" ? "free edits" : kind === "page" ? "free pages" : "free uploads";
  return Response.json(
    { error: `You've used today's ${what}. Create a free account to keep going.`, code: GUEST_LIMIT_CODE },
    { status: 429 },
  );
}
