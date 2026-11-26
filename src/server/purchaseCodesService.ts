import "server-only";
import { randomInt } from "node:crypto";
import type { ApiResult } from "@/lib/api/types";
import type { Attribution } from "@/lib/marketing/attribution";
import { BOOK_BINDINGS, isPrintBindingId } from "@/lib/print/bookBindings";
import type { ShippingAddress } from "@/lib/orders/types";
import { SITE_URL } from "@/lib/siteUrl";
import { getSupabaseAdmin, getSupabaseAuth } from "@/lib/supabase/service";
import {
  MAX_CODES_PER_BATCH,
  campaignSlug,
  coveredPrintPages,
  normalizeCode,
  purchaseCodeLink,
  type AdminPurchaseCode,
  type AlbumPurchaseCode,
  type CreatePurchaseCodesInput,
  type PurchaseCodeBundle,
  type PurchaseCodeChannel,
  type PurchaseCodePreview,
  type PurchaseCodeStatus,
} from "@/lib/purchaseCodes/types";
import { isAutomaticAlbumName } from "@/components/v2/studio/albumNames";
import { projectAccess } from "@/server/libraryAccess";
import { createProject } from "@/server/libraryService";
import { pricePrintOrder } from "@/server/pricingService";
import { sendEmail } from "@/server/email/resend";
import { purchaseCodeEmail } from "@/server/email/purchaseCodeEmail";
import { quoted, recordActivity } from "@/server/activityService";

type Row = Record<string, unknown>;

function db() {
  return getSupabaseAdmin();
}

function log(level: string, message: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, message, ...ctx }));
}

// No 0/O, 1/I/L: codes get read off paper and typed in.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function generateCode(): string {
  const part = () => Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
  return `CM-${part()}-${part()}`;
}

function bundleFromRow(row: Row): PurchaseCodeBundle {
  return {
    includedPages: row.included_pages as number,
    editsPerPage: row.edits_per_page as number,
    portraitsPerPage: row.portraits_per_page as number,
    bindingId: row.binding_id as PurchaseCodeBundle["bindingId"],
    backsIncluded: row.backs_included === true,
    shippingLevel: (row.shipping_level as string) ?? "MAIL",
    maxBookCents: (row.max_book_cents as number | null) ?? null,
  };
}

function isExpired(row: Row): boolean {
  const expires = row.expires_at as string | null;
  return !row.redeemed_at && expires != null && new Date(expires).getTime() < Date.now();
}

function statusOf(row: Row): PurchaseCodeStatus {
  if (row.status === "void") return "void";
  if (row.book_order_id) return "book_ordered";
  if (row.redeemed_at) return "redeemed";
  if (isExpired(row)) return "expired";
  return "active";
}

function adminCodeFromRow(row: Row, extra: { email: string | null; projectName: string | null; sends: Row[] }): AdminPurchaseCode {
  return {
    ...bundleFromRow(row),
    id: row.id as string,
    code: row.code as string,
    campaign: row.campaign as string,
    campaignSlug: row.campaign_slug as string,
    status: statusOf(row),
    expiresAt: (row.expires_at as string | null) ?? null,
    recipientName: (row.recipient_name as string | null) ?? null,
    recipientEmail: (row.recipient_email as string | null) ?? null,
    recipientPhone: (row.recipient_phone as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    createdAt: row.created_at as string,
    redeemedAt: (row.redeemed_at as string | null) ?? null,
    redeemedByEmail: extra.email,
    projectId: (row.project_id as string | null) ?? null,
    projectName: extra.projectName,
    pagesUsed: (row.pages_used as number) ?? 0,
    bookOrderId: (row.book_order_id as string | null) ?? null,
    bookCoveredCents: (row.book_covered_cents as number | null) ?? null,
    sends: extra.sends.map((s) => ({
      channel: s.channel as PurchaseCodeChannel,
      recipient: (s.recipient as string | null) ?? null,
      sentAt: s.sent_at as string,
    })),
  };
}

// ---- admin -----------------------------------------------------------------------------------

function cleanText(value: string | null | undefined, max: number): string | null {
  const v = value?.trim();
  return v ? v.slice(0, max) : null;
}

function validateBundle(input: PurchaseCodeBundle): string | null {
  const int = (n: unknown, lo: number, hi: number) => typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi;
  if (!int(input.includedPages, 1, 200)) return "Included pages must be between 1 and 200.";
  if (!int(input.editsPerPage, 0, 20)) return "Edits per page must be between 0 and 20.";
  if (!int(input.portraitsPerPage, 0, 5)) return "Portrait conversions per page must be between 0 and 5.";
  if (!isPrintBindingId(input.bindingId)) return "Pick a binding.";
  if (input.maxBookCents != null && !int(input.maxBookCents, 1, 100_000)) return "The book cap must be between $0.01 and $1,000.";
  const pages = coveredPrintPages(input);
  const spec = input.backsIncluded ? input.includedPages * 2 : input.includedPages;
  if (pages < spec) return "That many pages doesn't fit in this binding. Pick a bigger binding or fewer pages.";
  return null;
}

export async function createPurchaseCodes(
  input: CreatePurchaseCodesInput,
  adminId: string,
): Promise<ApiResult<AdminPurchaseCode[]>> {
  const campaign = cleanText(input.campaign, 80);
  if (!campaign) return { data: null, error: { message: "Give the codes a campaign name." } };
  const problem = validateBundle(input);
  if (problem) return { data: null, error: { message: problem } };
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > MAX_CODES_PER_BATCH) {
    return { data: null, error: { message: `Make between 1 and ${MAX_CODES_PER_BATCH} codes at a time.` } };
  }
  let expiresAt: string | null = null;
  if (input.expiresAt) {
    const t = new Date(input.expiresAt);
    if (Number.isNaN(t.getTime())) return { data: null, error: { message: "The expiry date isn't a date." } };
    expiresAt = t.toISOString();
  }
  const email = cleanText(input.recipientEmail, 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { data: null, error: { message: "The recipient's email address doesn't look right." } };
  }

  const base = {
    campaign,
    campaign_slug: campaignSlug(campaign),
    included_pages: input.includedPages,
    edits_per_page: input.editsPerPage,
    portraits_per_page: input.portraitsPerPage,
    binding_id: input.bindingId,
    backs_included: input.backsIncluded,
    shipping_level: "MAIL",
    max_book_cents: input.maxBookCents,
    expires_at: expiresAt,
    // Recipient details only make sense on a single code.
    recipient_name: input.quantity === 1 ? cleanText(input.recipientName, 120) : null,
    recipient_email: input.quantity === 1 ? email : null,
    recipient_phone: input.quantity === 1 ? cleanText(input.recipientPhone, 32) : null,
    note: cleanText(input.note, 500),
    created_by: adminId,
  };

  // A clash between random codes is vanishingly rare; retry the batch's clashing rows a few times.
  let rows = Array.from({ length: input.quantity }, () => ({ ...base, code: generateCode() }));
  const created: Row[] = [];
  for (let attempt = 0; attempt < 5 && rows.length > 0; attempt++) {
    const { data, error } = await db().from("purchase_codes").insert(rows).select("*");
    if (!error) {
      created.push(...(data ?? []));
      rows = [];
      break;
    }
    if (!error.message.includes("purchase_codes_code_key")) return { data: null, error: { message: error.message } };
    rows = rows.map((r) => ({ ...r, code: generateCode() }));
  }
  if (rows.length > 0) return { data: null, error: { message: "Couldn't make unique codes. Please try again." } };

  log("info", "Admin created purchase codes", { adminId, campaign, count: created.length });
  return { data: created.map((r) => adminCodeFromRow(r, { email: null, projectName: null, sends: [] })), error: null };
}

async function emailsFor(userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(
    [...new Set(userIds)].map(async (id) => {
      const { data } = await getSupabaseAuth().auth.admin.getUserById(id);
      if (data?.user?.email) out.set(id, data.user.email);
    }),
  );
  return out;
}

export async function listPurchaseCodes(): Promise<ApiResult<AdminPurchaseCode[]>> {
  const { data, error } = await db()
    .from("purchase_codes")
    .select("*")
    // Packages customers bought for themselves are not gift codes; they live in the package catalog.
    .eq("source", "admin")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) return { data: null, error: { message: error.message } };
  const rows = data ?? [];
  const ids = rows.map((r) => r.id as string);
  const projectIds = rows.map((r) => r.project_id as string | null).filter((v): v is string => Boolean(v));
  const [sends, projects, emails] = await Promise.all([
    ids.length
      ? db().from("purchase_code_sends").select("code_id, channel, recipient, sent_at").in("code_id", ids).order("sent_at", { ascending: false })
      : Promise.resolve({ data: [] as Row[], error: null }),
    projectIds.length
      ? db().from("library_projects").select("id, name").in("id", projectIds)
      : Promise.resolve({ data: [] as Row[], error: null }),
    emailsFor(rows.map((r) => r.redeemed_by as string | null).filter((v): v is string => Boolean(v))),
  ]);
  const sendsBy = new Map<string, Row[]>();
  for (const s of sends.data ?? []) {
    const list = sendsBy.get(s.code_id as string) ?? [];
    list.push(s);
    sendsBy.set(s.code_id as string, list);
  }
  const names = new Map((projects.data ?? []).map((p) => [p.id as string, p.name as string]));
  return {
    data: rows.map((r) =>
      adminCodeFromRow(r, {
        email: r.redeemed_by ? (emails.get(r.redeemed_by as string) ?? null) : null,
        projectName: r.project_id ? (names.get(r.project_id as string) ?? null) : null,
        sends: sendsBy.get(r.id as string) ?? [],
      }),
    ),
    error: null,
  };
}

export async function voidPurchaseCode(id: string, adminId: string): Promise<ApiResult<{ id: string }>> {
  const { data, error } = await db()
    .from("purchase_codes")
    .update({ status: "void", voided_at: new Date().toISOString(), voided_by: adminId })
    .eq("id", id)
    .eq("status", "active")
    .is("book_order_id", null)
    .select("id")
    .maybeSingle();
  if (error) return { data: null, error: { message: error.message } };
  if (!data) return { data: null, error: { message: "That code can't be voided (already void, or its book was ordered).", code: "INVALID_STATE" } };
  log("info", "Admin voided purchase code", { adminId, codeId: id });
  return { data: { id }, error: null };
}

export async function recordPurchaseCodeSend(
  codeId: string,
  channel: PurchaseCodeChannel,
  recipient: string | null,
  adminId: string,
): Promise<ApiResult<{ ok: true }>> {
  const { error } = await db()
    .from("purchase_code_sends")
    .insert({ code_id: codeId, channel, recipient: cleanText(recipient, 254), sent_by: adminId });
  if (error) return { data: null, error: { message: error.message } };
  return { data: { ok: true }, error: null };
}

async function codeRowById(id: string): Promise<ApiResult<Row>> {
  const { data, error } = await db().from("purchase_codes").select("*").eq("id", id).maybeSingle();
  if (error) return { data: null, error: { message: error.message } };
  if (!data) return { data: null, error: { message: "Code not found", code: "NOT_FOUND" } };
  return { data, error: null };
}

export async function emailPurchaseCode(input: {
  id: string;
  to: string;
  adminId: string;
}): Promise<ApiResult<{ ok: true }>> {
  const to = input.to.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { data: null, error: { message: "That email address doesn't look right." } };
  const found = await codeRowById(input.id);
  if (found.error) return found;
  const row = found.data!;
  const status = statusOf(row);
  if (status !== "active") return { data: null, error: { message: `This code is ${status.replace("_", " ")}; it can't be sent.`, code: "INVALID_STATE" } };
  const link = purchaseCodeLink(SITE_URL, { code: row.code as string, campaignSlug: row.campaign_slug as string }, "email");
  const message = purchaseCodeEmail({
    to,
    code: row.code as string,
    campaign: row.campaign as string,
    recipientName: (row.recipient_name as string | null) ?? null,
    note: (row.note as string | null) ?? null,
    bundle: bundleFromRow(row),
    expiresAt: (row.expires_at as string | null) ?? null,
    url: link,
  });
  const sent = await sendEmail(message);
  if (!sent) return { data: null, error: { message: "The email couldn't be sent. Please try again." } };
  await recordPurchaseCodeSend(input.id, "email", to, input.adminId);
  if (!row.recipient_email) await db().from("purchase_codes").update({ recipient_email: to }).eq("id", input.id);
  log("info", "Admin emailed purchase code", { adminId: input.adminId, codeId: input.id });
  return { data: { ok: true }, error: null };
}

// ---- customer --------------------------------------------------------------------------------

async function codeRowByValue(raw: string): Promise<ApiResult<Row>> {
  const code = normalizeCode(raw);
  if (!/^[A-Z0-9][A-Z0-9-]{5,31}$/.test(code)) return { data: null, error: { message: "That code isn't valid.", code: "NOT_FOUND" } };
  const { data, error } = await db().from("purchase_codes").select("*").eq("code", code).maybeSingle();
  if (error) return { data: null, error: { message: error.message } };
  if (!data) return { data: null, error: { message: "We couldn't find that code. Check it and try again.", code: "NOT_FOUND" } };
  return { data, error: null };
}

export async function getPurchaseCodePreview(raw: string, userId: string | null): Promise<ApiResult<PurchaseCodePreview>> {
  const found = await codeRowByValue(raw);
  if (found.error) return found;
  const row = found.data!;
  const status = statusOf(row);
  const state: PurchaseCodePreview["state"] =
    status === "void" ? "void" : status === "expired" ? "expired" : status === "active" ? "available" : "redeemed";
  const mine = Boolean(userId) && row.redeemed_by === userId;
  return {
    data: {
      code: row.code as string,
      campaign: row.campaign as string,
      bundle: bundleFromRow(row),
      note: (row.note as string | null) ?? null,
      // The name on a redeemed code is only shown to the person who redeemed it.
      recipientName: state === "available" || mine ? ((row.recipient_name as string | null) ?? null) : null,
      state,
      albumId: mine ? ((row.project_id as string | null) ?? null) : null,
    },
    error: null,
  };
}

/** An album the user owns with no photos, no code and a name the studio made up; null if none. */
async function emptyAutomaticAlbum(userId: string): Promise<string | null> {
  const { data: albums } = await db()
    .from("library_projects")
    .select("id, name")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  const candidates = (albums ?? []).filter((a) => isAutomaticAlbumName((a.name as string) ?? ""));
  for (const album of candidates) {
    const id = album.id as string;
    const [photos, code] = await Promise.all([
      db().from("library_photos").select("id", { count: "exact", head: true }).eq("project_id", id),
      db().from("purchase_codes").select("id").eq("project_id", id).maybeSingle(),
    ]);
    if (photos.error || photos.count !== 0 || code.data) continue;
    return id;
  }
  return null;
}

/**
 * Binds a code to an album: one the caller owns that has no code yet, or a new album named
 * `albumName`. Returns the album to open.
 */
export async function redeemPurchaseCode(input: {
  code: string;
  userId: string;
  albumId?: string | null;
  albumName?: string | null;
  attribution: Attribution | null;
}): Promise<ApiResult<{ albumId: string; code: string }>> {
  const found = await codeRowByValue(input.code);
  if (found.error) return found;
  const row = found.data!;
  if (row.redeemed_by === input.userId && row.project_id) {
    return { data: { albumId: row.project_id as string, code: row.code as string }, error: null };
  }
  const status = statusOf(row);
  if (status === "void") return { data: null, error: { message: "This code has been canceled.", code: "INVALID_STATE" } };
  if (status === "expired") return { data: null, error: { message: "This code has expired.", code: "INVALID_STATE" } };
  if (status !== "active") return { data: null, error: { message: "This code has already been used.", code: "ALREADY_REDEEMED" } };

  let albumId = input.albumId ?? null;
  let createdAlbum = false;
  if (albumId) {
    const access = await projectAccess(input.userId, albumId);
    if (!access) return { data: null, error: { message: "Album not found", code: "NOT_FOUND" } };
    if (access.role !== "owner") return { data: null, error: { message: "Use the code on an album you own.", code: "FORBIDDEN" } };
    const { data: taken } = await db().from("purchase_codes").select("id").eq("project_id", albumId).maybeSingle();
    if (taken) return { data: null, error: { message: "That album already has a code. Pick another album or start a new one.", code: "ALBUM_HAS_CODE" } };
  } else {
    const name = cleanText(input.albumName, 80) ?? `My ${row.campaign as string} book`;
    // A new account already has an empty "Album 1" the studio made for it: use that (renamed)
    // rather than leave a stray empty album beside the code's one.
    const spare = await emptyAutomaticAlbum(input.userId);
    if (spare) {
      const { error: renameError } = await db().from("library_projects").update({ name }).eq("id", spare);
      if (renameError) return { data: null, error: { message: renameError.message } };
      albumId = spare;
    } else {
      const project = await createProject(input.userId, name);
      if (project.error) return { data: null, error: project.error };
      albumId = project.data!.id;
      createdAlbum = true;
    }
  }

  const { data: claimed, error } = await db()
    .from("purchase_codes")
    .update({
      redeemed_by: input.userId,
      redeemed_at: new Date().toISOString(),
      project_id: albumId,
      redeem_attribution: input.attribution,
    })
    .eq("id", row.id as string)
    .eq("status", "active")
    .is("redeemed_at", null)
    .select("id")
    .maybeSingle();
  if (error || !claimed) {
    if (createdAlbum) await db().from("library_projects").delete().eq("id", albumId);
    if (error?.message.includes("purchase_codes_project_idx")) {
      return { data: null, error: { message: "That album already has a code.", code: "ALBUM_HAS_CODE" } };
    }
    return { data: null, error: { message: error?.message ?? "This code has already been used.", code: "ALREADY_REDEEMED" } };
  }

  const { data: album } = await db().from("library_projects").select("name").eq("id", albumId).maybeSingle();
  await recordActivity({
    userId: input.userId,
    category: "albums",
    type: "purchase_code_redeemed",
    description: `Used code ${row.code as string} (${row.campaign as string}) on album ${quoted((album?.name as string | undefined) ?? null, "Untitled album")}`,
    referenceType: "library_project",
    referenceId: albumId,
  });
  log("info", "Purchase code redeemed", { userId: input.userId, codeId: row.id, albumId, createdAlbum });
  return { data: { albumId, code: row.code as string }, error: null };
}

/**
 * Photos in the album that have a coloring page and were paid for outside the code: a page made
 * here from credit, which the ledger records against the photo. Copies brought in from another
 * album have new ids and no charge here, so they aren't in this set.
 */
async function chargedPhotoIds(photoIds: string[]): Promise<Set<string>> {
  if (photoIds.length === 0) return new Set();
  const { data, error } = await db()
    .from("credit_ledger")
    .select("reference_id")
    .eq("reference_type", "library_photo")
    .eq("reason", "sheet_generation")
    .in("reference_id", photoIds);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => r.reference_id as string));
}

/** Photos among these that have a coloring page (not only a reframed photo). */
async function photosWithPages(photoIds: string[]): Promise<Set<string>> {
  if (photoIds.length === 0) return new Set();
  const { data, error } = await db()
    .from("library_sheet_revisions")
    .select("photo_id, kind")
    .in("photo_id", photoIds);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).filter((r) => r.kind !== "photo").map((r) => r.photo_id as string));
}

/**
 * Pages already in the album that its code hasn't counted (photos copied in with their pages, as
 * the year album does) take the code's free photos, in album order, so the first ones make up the
 * book. Claims with claim_brought_in_page(), which never charges and isn't counted against a
 * refund, and stops when the code has none left. Safe to call again: a claimed or paid photo is
 * skipped. Returns how many it claimed.
 */
export async function claimMadePagesForCode(projectId: string): Promise<number> {
  const { data: code, error } = await db()
    .from("purchase_codes")
    .select("id, pages_used, included_pages, book_order_id")
    .eq("project_id", projectId)
    .eq("status", "active")
    .maybeSingle();
  if (error || !code || code.book_order_id) return 0;
  if ((code.pages_used as number) >= (code.included_pages as number)) return 0;

  const [{ data: photos, error: pErr }, { data: uses, error: uErr }] = await Promise.all([
    db().from("library_photos").select("id").eq("project_id", projectId).order("position", { ascending: true }),
    db().from("purchase_code_photos").select("photo_id").eq("code_id", code.id as string),
  ]);
  if (pErr || uErr || !photos?.length) return 0;
  const used = new Set((uses ?? []).map((u) => u.photo_id as string));
  const open = photos.map((p) => p.id as string).filter((id) => !used.has(id));
  if (open.length === 0) return 0;

  let withPages: Set<string>;
  let charged: Set<string>;
  try {
    [withPages, charged] = await Promise.all([photosWithPages(open), chargedPhotoIds(open)]);
  } catch (e) {
    log("error", "claimMadePagesForCode: lookup failed", { projectId, error: String(e) });
    return 0;
  }

  let claimed = 0;
  for (const id of open) {
    if (!withPages.has(id) || charged.has(id)) continue;
    // Counted as brought in (migration 0045), so canceling the package doesn't charge for it.
    const { data: claimedBy, error: cErr } = await db().rpc("claim_brought_in_page", { p_photo_id: id });
    if (cErr) {
      log("error", "claimMadePagesForCode: claim failed", { projectId, photoId: id, error: cErr.message });
      break;
    }
    // None left (or another request got there first): the rest stay outside the code.
    if (typeof claimedBy !== "string" || !claimedBy) break;
    claimed++;
  }
  if (claimed > 0) log("info", "Code claimed pages already made", { projectId, codeId: code.id, claimed });
  return claimed;
}

/**
 * "Add for a fee" on a page the album's code doesn't cover: charges one page from the caller's
 * credit (charge_photo_usage), so it counts as a paid extra page of this album's book. Refuses a
 * photo with no page, one the code already covers, and one already paid for.
 */
export async function payForExtraPage(
  userId: string,
  photoId: string,
): Promise<ApiResult<{ chargedCents: number; creditsBalanceCents: number }>> {
  const { data: photo, error } = await db().from("library_photos").select("id, project_id").eq("id", photoId).maybeSingle();
  if (error) return { data: null, error: { message: error.message } };
  if (!photo) return { data: null, error: { message: "Photo not found", code: "NOT_FOUND" } };
  const projectId = photo.project_id as string;
  if (!(await projectAccess(userId, projectId))) return { data: null, error: { message: "Photo not found", code: "NOT_FOUND" } };

  const { data: code } = await db()
    .from("purchase_codes")
    .select("id, book_order_id")
    .eq("project_id", projectId)
    .eq("status", "active")
    .maybeSingle();
  if (!code) return { data: null, error: { message: "This album has no book package.", code: "INVALID" } };
  if (code.book_order_id) return { data: null, error: { message: "This book has already been ordered.", code: "INVALID" } };

  const { data: use } = await db()
    .from("purchase_code_photos")
    .select("photo_id")
    .eq("code_id", code.id as string)
    .eq("photo_id", photoId)
    .maybeSingle();
  if (use) return { data: null, error: { message: "Your book already includes this page.", code: "ALREADY" } };
  try {
    if (!(await photosWithPages([photoId])).has(photoId)) {
      return { data: null, error: { message: "Make the page first.", code: "INVALID" } };
    }
    if ((await chargedPhotoIds([photoId])).has(photoId)) {
      return { data: null, error: { message: "This page is already paid for.", code: "ALREADY" } };
    }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Could not check the page" } };
  }

  const { data: result, error: chargeErr } = await db().rpc("charge_photo_usage", {
    p_user_id: userId,
    p_photo_id: photoId,
    p_kind: "generation",
  });
  if (chargeErr) {
    if (/insufficient credits/i.test(chargeErr.message)) {
      return { data: null, error: { message: "Not enough credit for this page.", code: "INSUFFICIENT_CREDITS" } };
    }
    return { data: null, error: { message: chargeErr.message } };
  }
  const r = (result ?? {}) as { chargedCents?: number; creditsBalanceCents?: number };
  log("info", "Paid for an extra page", { userId, photoId, projectId, chargedCents: r.chargedCents });
  return { data: { chargedCents: r.chargedCents ?? 0, creditsBalanceCents: r.creditsBalanceCents ?? 0 }, error: null };
}

/** The album's code and what is left of it; null when the album has none (or the caller can't see it). */
export async function getAlbumPurchaseCode(actorId: string, projectId: string): Promise<ApiResult<AlbumPurchaseCode | null>> {
  const access = await projectAccess(actorId, projectId);
  if (!access) return { data: null, error: { message: "Album not found", code: "NOT_FOUND" } };
  const { data: row, error } = await db()
    .from("purchase_codes")
    .select("*")
    .eq("project_id", projectId)
    .eq("status", "active")
    .maybeSingle();
  if (error) return { data: null, error: { message: error.message } };
  if (!row) return { data: null, error: null };
  // Pages brought in already made count first; re-read the code if any were claimed.
  if (!row.book_order_id && (row.pages_used as number) < (row.included_pages as number)) {
    const claimed = await claimMadePagesForCode(projectId);
    if (claimed > 0) row.pages_used = (row.pages_used as number) + claimed;
  }
  const { data: uses, error: usesError } = await db()
    .from("purchase_code_photos")
    .select("photo_id, generations_used, portraits_used")
    .eq("code_id", row.id as string);
  if (usesError) return { data: null, error: { message: usesError.message } };
  const photos: AlbumPurchaseCode["photos"] = {};
  for (const u of uses ?? []) {
    photos[u.photo_id as string] = {
      generationsUsed: u.generations_used as number,
      portraitsUsed: u.portraits_used as number,
    };
  }
  // Pages outside the code that were paid for here, so the studio doesn't ask for them again.
  let extraPhotoIds: string[] = [];
  const { data: albumPhotos } = await db().from("library_photos").select("id").eq("project_id", projectId);
  const outside = (albumPhotos ?? []).map((p) => p.id as string).filter((id) => !photos[id]);
  try {
    extraPhotoIds = [...(await chargedPhotoIds(outside))];
  } catch (e) {
    log("error", "getAlbumPurchaseCode: paid extras lookup failed", { projectId, error: String(e) });
  }
  return {
    data: {
      codeId: row.id as string,
      code: row.code as string,
      campaign: row.campaign as string,
      bundle: bundleFromRow(row),
      source: row.source === "package" ? "package" : "admin",
      shippingIncluded: row.shipping_included !== false,
      packagePriceCents: (row.package_price_cents as number | null) ?? null,
      shippingPrepaidCents: Number(row.shipping_prepaid_cents) || 0,
      isBuyer: row.redeemed_by === actorId,
      pagesUsed: row.pages_used as number,
      photos,
      extraPhotoIds,
      bookOrderId: (row.book_order_id as string | null) ?? null,
    },
    error: null,
  };
}

/** Whether the album's code pays for this action; the charge itself re-checks in the database. */
export async function purchaseCodeCovers(photoId: string, kind: "generation" | "edit" | "portrait"): Promise<boolean> {
  const { data, error } = await db().rpc("purchase_code_covers", { p_photo_id: photoId, p_kind: kind, p_claim: false });
  if (error) {
    log("error", "purchase_code_covers failed", { photoId, kind, error: error.message });
    return false;
  }
  return typeof data === "string" && data.length > 0;
}

export async function releasePurchaseCodeUse(photoId: string, kind: "generation" | "edit" | "portrait"): Promise<void> {
  const { error } = await db().rpc("purchase_code_release", { p_photo_id: photoId, p_kind: kind });
  if (error) log("error", "purchase_code_release failed", { photoId, kind, error: error.message });
}

/**
 * What the album's code pays toward a printed book: the price of the included book (its binding,
 * up to its page count, standard shipping, to this address), capped by the code's limit. Null when
 * the album has no code or its book was already paid for by another order.
 */
export async function purchaseCodeBookCoverage(input: {
  /** Only the person who redeemed the code can spend it on a book (not the album's contributors). */
  userId: string;
  projectId: string | null | undefined;
  orderId?: string | null;
  pageCount: number;
  /**
   * The binding the order is in. A package pays for printing its own binding only: an order in
   * another binding gets no coverage from it. Admin codes ignore this (they cover a book's price).
   */
  bindingId?: string | null;
  shippingAddress: Pick<ShippingAddress, "city" | "state_code" | "postcode" | "country_code">;
}): Promise<ApiResult<{ codeId: string; coveredCents: number } | null>> {
  if (!input.projectId) return { data: null, error: null };
  const { data: row, error } = await db()
    .from("purchase_codes")
    .select("*")
    .eq("project_id", input.projectId)
    .eq("status", "active")
    .maybeSingle();
  if (error) return { data: null, error: { message: error.message } };
  if (!row || row.redeemed_by !== input.userId) return { data: null, error: null };
  if (row.book_order_id && row.book_order_id !== input.orderId) return { data: null, error: null };
  const bundle = bundleFromRow(row);
  const shippingIncluded = row.shipping_included !== false;
  // Shipping a package's buyer paid up front. It is applied to whatever book this album orders;
  // the caller caps the coverage at the order's total.
  const shippingPrepaid = shippingIncluded ? 0 : Number(row.shipping_prepaid_cents) || 0;
  // A package pays toward printing its own binding, and nothing toward another one (but shipping
  // paid with it still counts).
  if (!shippingIncluded && input.bindingId && input.bindingId !== bundle.bindingId) {
    return shippingPrepaid > 0
      ? { data: { codeId: row.id as string, coveredCents: shippingPrepaid }, error: null }
      : { data: null, error: null };
  }
  // The included book's page count for this order: no more than the code covers, fitted to the
  // code's binding (an order in another binding can have a count this one can't print).
  const spec = BOOK_BINDINGS[bundle.bindingId];
  const covered = coveredPrintPages(bundle);
  let pageCount = Math.max(Math.min(input.pageCount, covered), spec.minPages);
  if (pageCount % spec.pageMultiple !== 0) pageCount += spec.pageMultiple - (pageCount % spec.pageMultiple);
  pageCount = Math.min(pageCount, Math.max(covered, spec.minPages));
  const priced = await pricePrintOrder({
    bindingId: bundle.bindingId,
    pageCount,
    shippingLevel: bundle.shippingLevel,
    shippingAddress: {
      city: input.shippingAddress.city,
      state_code: input.shippingAddress.state_code ?? "",
      postcode: input.shippingAddress.postcode,
      country_code: input.shippingAddress.country_code,
    },
  });
  if (priced.error) return { data: null, error: priced.error };
  // An admin code covers print + standard shipping + tax. A package covers the printed book only:
  // shipping and the tax on it stay with the customer's wallet, less any shipping paid up front.
  const full = shippingIncluded
    ? priced.data.price.totalCents
    : priced.data.price.printPriceCents + shippingPrepaid;
  const coveredCents = bundle.maxBookCents != null ? Math.min(full, bundle.maxBookCents) : full;
  return { data: { codeId: row.id as string, coveredCents }, error: null };
}
