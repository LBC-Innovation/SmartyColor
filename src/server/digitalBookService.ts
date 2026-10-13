import "server-only";
import type { ApiResult } from "@/lib/api/types";
import { DIGITAL_BOOK_CENTS, INSUFFICIENT_CREDITS_CODE } from "@/lib/credits/pricing";
import type { DigitalBookPage } from "@/lib/orders/types";
import { DIGITAL_FORMAT } from "@/lib/print/bookBindings";
import { sheetsToPdf, type PdfBlankPage, type PdfSheetPage } from "@/lib/print/pdf";
import { defaultPrintPrefs, type PrintPrefs } from "@/lib/print/settings";
import { getSupabaseAdmin } from "@/lib/supabase/service";
import { revisionDataUrlById } from "@/server/libraryImages";
import { getObjectBytes, putObject, removeObjects } from "@/server/storage/libraryFiles";

/** Digital books are always US Letter portrait, like the book-order preview. */
const BOOK_PREFS: PrintPrefs = { ...defaultPrintPrefs, paper: "letter", orientation: "portrait" };
const ROTATIONS = [0, 90, 180, 270];

function log(level: string, message: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, message, ...ctx }));
}

/** Validate a page manifest from untrusted input; null when it isn't a usable book. */
export function parsePages(input: unknown, maxPages = DIGITAL_FORMAT.maxPages): DigitalBookPage[] | null {
  if (!Array.isArray(input) || input.length < 1 || input.length > maxPages) return null;
  const pages: DigitalBookPage[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") return null;
    const p = raw as Record<string, unknown>;
    if (p.kind === "blank") {
      pages.push({ kind: "blank", variant: p.variant === "lined" ? "lined" : "plain" });
    } else if (p.kind === "photo") {
      if (typeof p.revisionId !== "string" || !p.revisionId) return null;
      const rotation = typeof p.rotation === "number" ? p.rotation : 0;
      if (!ROTATIONS.includes(rotation)) return null;
      pages.push({
        kind: "photo",
        revisionId: p.revisionId,
        rotation: rotation as 0 | 90 | 180 | 270,
        mirrored: p.mirrored === true,
        ...(p.fit === "full" ? { fit: "full" as const } : {}),
      });
    } else {
      return null;
    }
  }
  return pages.some((p) => p.kind === "photo") ? pages : null;
}

/** Build the book PDF from a manifest, reading each sheet the user owns from storage. */
export async function buildPdf(
  userId: string,
  pages: DigitalBookPage[],
  options: { gutterIn?: number; bleedIn?: number; prepareSheet?: (dataUrl: string) => Promise<string> } = {},
): Promise<ApiResult<Uint8Array>> {
  const cache = new Map<string, string>();
  const sheets: Array<PdfSheetPage | PdfBlankPage> = [];
  for (const page of pages) {
    if (page.kind === "blank") {
      sheets.push({ pageKind: page.variant === "lined" ? "lined" : "blank", printPrefs: BOOK_PREFS });
      continue;
    }
    let dataUrl = cache.get(page.revisionId);
    if (!dataUrl) {
      const rev = await revisionDataUrlById(userId, page.revisionId);
      if (rev.error) {
        return {
          data: null,
          error: { message: "One of the pages in this book is no longer available.", code: "NOT_FOUND" },
        };
      }
      try {
        dataUrl = options.prepareSheet ? await options.prepareSheet(rev.data!.dataUrl) : rev.data!.dataUrl;
      } catch {
        return { data: null, error: { message: "One of the pages in this book couldn't be prepared for print." } };
      }
      cache.set(page.revisionId, dataUrl);
    }
    sheets.push({
      imageDataUrl: dataUrl,
      printPrefs: BOOK_PREFS,
      rotation: page.rotation,
      mirrored: page.mirrored,
      fit: page.fit,
    });
  }
  try {
    return { data: await sheetsToPdf(sheets, { gutterIn: options.gutterIn, bleedIn: options.bleedIn }), error: null };
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Could not make the PDF." } };
  }
}

function pdfPath(userId: string, orderId: string) {
  return `${userId}/_orders/${orderId}.pdf`;
}

/**
 * Buy a print-at-home book. The PDF is built first, so a page that can't be
 * read never costs the user anything; the wallet charge and the order are one
 * transaction.
 */
export async function createDigitalBookOrder(input: {
  userId: string;
  contactEmail: string;
  projectTitle: string;
  pages: unknown;
}): Promise<ApiResult<{ orderId: string; creditsBalanceCents: number; creditsAppliedCents: number }>> {
  const pages = parsePages(input.pages);
  if (!pages) {
    return { data: null, error: { message: "Add at least one coloring page to the book.", code: "INVALID_PAGES" } };
  }

  const db = getSupabaseAdmin();
  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("credits_balance")
    .eq("id", input.userId)
    .maybeSingle();
  if (profileError) return { data: null, error: { message: profileError.message } };
  if (!profile) return { data: null, error: { message: "User profile not found" } };
  if ((profile.credits_balance as number) < DIGITAL_BOOK_CENTS) {
    return {
      data: null,
      error: { message: "You do not have enough credits for this book.", code: INSUFFICIENT_CREDITS_CODE },
    };
  }

  const built = await buildPdf(input.userId, pages);
  if (built.error) return { data: null, error: built.error };

  const orderId = crypto.randomUUID();
  const path = pdfPath(input.userId, orderId);
  let storedPath: string | null = null;
  try {
    await putObject(path, built.data!, "application/pdf");
    storedPath = path;
  } catch (e) {
    // Not fatal: the PDF can always be rebuilt from the saved page list.
    log("warn", "Digital book PDF could not be stored", {
      userId: input.userId,
      orderId,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  const { data, error } = await db.rpc("create_digital_book_order", {
    p_user_id: input.userId,
    p_order_id: orderId,
    p_email: input.contactEmail,
    p_title: input.projectTitle,
    p_page_count: pages.length,
    p_price_cents: DIGITAL_BOOK_CENTS,
    p_pages: pages,
    p_pdf_path: storedPath,
  });

  if (error) {
    if (storedPath) void removeObjects([storedPath]).catch(() => undefined);
    if (error.message.includes("insufficient credits")) {
      return {
        data: null,
        error: { message: "You do not have enough credits for this book.", code: INSUFFICIENT_CREDITS_CODE },
      };
    }
    return { data: null, error: { message: error.message } };
  }

  log("info", "Digital book ordered", { userId: input.userId, orderId, pageCount: pages.length });
  return {
    data: data as { orderId: string; creditsBalanceCents: number; creditsAppliedCents: number },
    error: null,
  };
}

/** PDF bytes for one of the user's paid digital orders, for any number of downloads. */
export async function getDigitalOrderPdf(
  userId: string,
  orderId: string,
): Promise<ApiResult<{ bytes: Uint8Array; title: string }>> {
  const { data, error } = await getSupabaseAdmin()
    .from("book_orders")
    .select("project_title, status, fulfillment, digital_pages, digital_pdf_path")
    .eq("id", orderId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { data: null, error: { message: error.message } };
  if (!data || data.fulfillment !== "digital") {
    return { data: null, error: { message: "Order not found", code: "NOT_FOUND" } };
  }
  if (data.status !== "paid") {
    return { data: null, error: { message: "This order's PDF is no longer available.", code: "INVALID_STATE" } };
  }
  const title = (data.project_title as string | null)?.trim() || "coloring-book";

  const storedPath = data.digital_pdf_path as string | null;
  if (storedPath) {
    try {
      const obj = await getObjectBytes(storedPath);
      return { data: { bytes: obj.bytes, title }, error: null };
    } catch {
      /* fall through and rebuild */
    }
  }

  const pages = parsePages(data.digital_pages);
  if (!pages) return { data: null, error: { message: "This order has no saved pages." } };
  const built = await buildPdf(userId, pages);
  if (built.error) return { data: null, error: built.error };
  return { data: { bytes: built.data!, title }, error: null };
}
