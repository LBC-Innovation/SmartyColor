import "server-only";
import type Stripe from "stripe";
import type { ApiResult } from "@/lib/api/types";
import { BOOK_PACKAGES_ENABLED } from "@/lib/auth/features";
import {
  PACKAGE_ALBUM_NAME_MAX,
  PACKAGE_CHECKOUT_SESSION_PARAM,
  PACKAGE_NOT_CANCELABLE_CODE,
  PACKAGE_PRICE_CHANGED_CODE,
  PACKAGE_SHIPPING_CHANGED_CODE,
  PACKAGE_SHIPPING_UNAVAILABLE_CODE,
  PACKAGE_UNAVAILABLE_CODE,
  isBookBindingId,
  packagePrintFit,
  type AdminBookPackage,
  type AdminBookPackageUpdate,
  type BookPackage,
  type BookPackageConfirmation,
  type BookPackagePurchase,
  type BookPackageRefund,
  type BookPackageRefundQuote,
  type BookPackageShippingInput,
  type BookPackageShippingQuote,
} from "@/lib/bookPackages/types";
import { normalizeShippingAddress, validateShippingAddress } from "@/lib/orders/shippingAddress";
import type { ShippingAddress } from "@/lib/orders/types";
import { BOOK_BINDINGS, type BookBindingId } from "@/lib/print/bookBindings";
import { coveredPrintPages } from "@/lib/purchaseCodes/types";
import { getSupabaseAdmin } from "@/lib/supabase/service";
import { quoted, recordActivity } from "@/server/activityService";
import { pricePrintOrder } from "@/server/pricingService";
import { saveAddress } from "@/server/savedAddressService";
import { getStripe } from "@/server/stripe/client";
import { appOrigin } from "@/server/stripe/config";

type Row = Record<string, unknown>;

/** Metadata `kind` on a Stripe checkout that buys a package (top-ups use `purpose` instead). */
export const BOOK_PACKAGE_CHECKOUT_KIND = "book_package";
/** The checkout is not a package checkout; nothing to do with it. */
export const NOT_BOOK_PACKAGE_CODE = "NOT_BOOK_PACKAGE";
/** Stripe has the checkout but has not collected the money yet. */
export const PACKAGE_PAYMENT_PENDING_CODE = "PAYMENT_PENDING";

const CHECKOUT_SESSION_ID_RE = /^cs_[A-Za-z0-9_]{8,250}$/;

function db() {
  return getSupabaseAdmin();
}

function log(level: string, message: string, ctx: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level, message, ...ctx }));
}

function cleanAlbumName(raw: unknown, bindingId: BookBindingId): string {
  const fallback = `My ${BOOK_BINDINGS[bindingId].shortLabel.toLowerCase()}`;
  if (typeof raw !== "string") return fallback;
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, PACKAGE_ALBUM_NAME_MAX);
  return name || fallback;
}

function packageFromRow(row: Row): BookPackage {
  return {
    bindingId: row.binding_id as BookBindingId,
    includedPhotos: row.included_photos as number,
    editsPerPhoto: row.edits_per_photo as number,
    priceCents: row.price_cents as number,
    sortOrder: row.sort_order as number,
  };
}

// ---- catalog ---------------------------------------------------------------------------------

/** Packages a customer can buy: active, priced, and able to print their photos in the binding. */
export async function listBuyablePackages(): Promise<ApiResult<BookPackage[]>> {
  if (!BOOK_PACKAGES_ENABLED) return { data: [], error: null };
  const { data, error } = await db()
    .from("book_packages")
    .select("*")
    .eq("active", true)
    .not("price_cents", "is", null)
    .order("sort_order", { ascending: true });
  if (error) return { data: null, error: { message: error.message } };
  const packages = (data ?? [])
    .map(packageFromRow)
    .filter((p) => packagePrintFit(p.bindingId, p.includedPhotos).fits);
  return { data: packages, error: null };
}

/** One buyable package, read from the catalog. The price is only ever taken from here. */
async function buyablePackage(bindingId: BookBindingId): Promise<ApiResult<BookPackage>> {
  const all = await listBuyablePackages();
  if (all.error) return all;
  const found = all.data!.find((p) => p.bindingId === bindingId);
  if (!found) {
    return { data: null, error: { message: "That book isn't available right now.", code: PACKAGE_UNAVAILABLE_CODE } };
  }
  return { data: found, error: null };
}

function priceGuard(pkg: BookPackage, expectedPriceCents: number | null | undefined): ApiResult<never> | null {
  if (expectedPriceCents != null && expectedPriceCents !== pkg.priceCents) {
    return {
      data: null,
      error: { message: "The price of this book changed.", code: PACKAGE_PRICE_CHANGED_CODE },
    };
  }
  return null;
}

// ---- shipping paid with the package ------------------------------------------------------------

/**
 * Standard shipping (and the tax the printer adds) for the package's book to this address: the
 * same book, speed and address that purchaseCodeBookCoverage() prices at checkout, so paying this
 * now leaves nothing to pay when the book is ordered as bought.
 */
export async function quotePackageShipping(input: {
  bindingId: BookBindingId;
  address: Partial<ShippingAddress> | null | undefined;
}): Promise<ApiResult<BookPackageShippingQuote>> {
  const pkg = await buyablePackage(input.bindingId);
  if (pkg.error) return pkg;
  if (!input.address || Object.keys(validateShippingAddress(input.address)).length > 0) {
    return { data: null, error: { message: "Complete the address to see the shipping price.", code: "INVALID_ADDRESS" } };
  }
  const address = normalizeShippingAddress(input.address);
  const p = pkg.data!;
  const priced = await pricePrintOrder({
    bindingId: p.bindingId,
    pageCount: coveredPrintPages({ includedPages: p.includedPhotos, bindingId: p.bindingId, backsIncluded: true }),
    shippingLevel: "MAIL",
    shippingAddress: {
      city: address.city,
      state_code: address.state_code ?? "",
      postcode: address.postcode,
      country_code: address.country_code,
    },
  });
  if (priced.error) {
    log("error", "Book package shipping quote failed", { bindingId: p.bindingId, error: priced.error.message });
    return {
      data: null,
      error: { message: "We couldn't price shipping to that address just now.", code: PACKAGE_SHIPPING_UNAVAILABLE_CODE },
    };
  }
  const shippingCents = Math.max(0, priced.data!.price.totalCents - priced.data!.price.printPriceCents);
  // The part of it that is tax, so the pay screen can show shipping and tax on their own lines.
  const taxCents = Math.min(shippingCents, Math.max(0, priced.data!.price.taxCents));
  return {
    data: { bindingId: p.bindingId, shippingCents, taxCents, address, addressSuggestion: priced.data!.addressSuggestion ?? null },
    error: null,
  };
}

/** Reads the optional `shipping` of a purchase request body; null when absent or malformed. */
export function readShippingInput(raw: unknown): BookPackageShippingInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { address?: unknown; expectedShippingCents?: unknown };
  if (!r.address || typeof r.address !== "object") return null;
  if (typeof r.expectedShippingCents !== "number" || !Number.isInteger(r.expectedShippingCents) || r.expectedShippingCents < 0) {
    return null;
  }
  return { address: normalizeShippingAddress(r.address as Partial<ShippingAddress>), expectedShippingCents: r.expectedShippingCents };
}

/**
 * Re-quotes the shipping the customer chose to pay with the package and checks it against what
 * the screen showed. Saves the address to the account for the book order. Null = no shipping.
 */
async function settleShipping(
  userId: string,
  bindingId: BookBindingId,
  shipping: BookPackageShippingInput | null | undefined,
): Promise<ApiResult<{ shippingCents: number } | null>> {
  if (!shipping) return { data: null, error: null };
  const quote = await quotePackageShipping({ bindingId, address: shipping.address });
  if (quote.error) return quote;
  if (quote.data!.shippingCents !== shipping.expectedShippingCents) {
    return {
      data: null,
      error: { message: "The shipping price changed. Check the new price and pay again.", code: PACKAGE_SHIPPING_CHANGED_CODE },
    };
  }
  const saved = await saveAddress(userId, quote.data!.address);
  if (saved.error) log("error", "Saving the package shipping address failed", { userId, error: saved.error.message });
  return { data: { shippingCents: quote.data!.shippingCents }, error: null };
}

// ---- admin -----------------------------------------------------------------------------------

function adminFromRow(row: Row): AdminBookPackage {
  const bindingId = row.binding_id as BookBindingId;
  const included = row.included_photos as number;
  const fit = packagePrintFit(bindingId, included);
  return {
    bindingId,
    includedPhotos: included,
    editsPerPhoto: row.edits_per_photo as number,
    priceCents: (row.price_cents as number | null) ?? null,
    active: row.active === true,
    sortOrder: row.sort_order as number,
    updatedAt: row.updated_at as string,
    printedPages: fit.printedPages,
    fits: fit.fits,
    minPages: fit.minPages,
    maxPages: fit.maxPages,
  };
}

export async function listAdminPackages(): Promise<ApiResult<AdminBookPackage[]>> {
  const { data, error } = await db().from("book_packages").select("*").order("sort_order", { ascending: true });
  if (error) return { data: null, error: { message: error.message } };
  return { data: (data ?? []).map(adminFromRow), error: null };
}

export async function updateAdminPackage(
  bindingId: string,
  input: AdminBookPackageUpdate,
  adminId: string,
): Promise<ApiResult<AdminBookPackage>> {
  if (!isBookBindingId(bindingId)) return { data: null, error: { message: "Unknown binding.", code: "INVALID" } };
  const int = (n: unknown, lo: number, hi: number) => typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi;
  const current = await db().from("book_packages").select("*").eq("binding_id", bindingId).maybeSingle();
  if (current.error) return { data: null, error: { message: current.error.message } };
  if (!current.data) return { data: null, error: { message: "Package not found.", code: "NOT_FOUND" } };

  const update: Row = {};
  if (input.includedPhotos !== undefined) {
    if (!int(input.includedPhotos, 1, 200)) return { data: null, error: { message: "Photos must be between 1 and 200.", code: "INVALID" } };
    update.included_photos = input.includedPhotos;
  }
  if (input.editsPerPhoto !== undefined) {
    if (!int(input.editsPerPhoto, 0, 10)) return { data: null, error: { message: "Touch-ups must be between 0 and 10.", code: "INVALID" } };
    update.edits_per_photo = input.editsPerPhoto;
  }
  if (input.priceCents !== undefined) {
    if (input.priceCents !== null && !int(input.priceCents, 1, 1_000_00)) {
      return { data: null, error: { message: "Price must be between $0.01 and $1,000, or empty to hide.", code: "INVALID" } };
    }
    update.price_cents = input.priceCents;
  }
  if (input.active !== undefined) {
    if (typeof input.active !== "boolean") return { data: null, error: { message: "Active must be true or false.", code: "INVALID" } };
    update.active = input.active;
  }
  if (input.sortOrder !== undefined) {
    if (!int(input.sortOrder, 0, 1000)) return { data: null, error: { message: "Order must be between 0 and 1000.", code: "INVALID" } };
    update.sort_order = input.sortOrder;
  }
  const photos = (update.included_photos as number | undefined) ?? (current.data.included_photos as number);
  if (!packagePrintFit(bindingId, photos).fits) {
    return {
      data: null,
      error: { message: "That many photos doesn't fit this binding. Pick a bigger binding or a different count.", code: "INVALID" },
    };
  }

  const { data, error } = await db().from("book_packages").update(update).eq("binding_id", bindingId).select("*").maybeSingle();
  if (error) return { data: null, error: { message: error.message } };
  if (!data) return { data: null, error: { message: "Package not found.", code: "NOT_FOUND" } };
  log("info", "Admin updated book package", { adminId, bindingId, ...update });
  return { data: adminFromRow(data), error: null };
}

// ---- buying with the wallet ------------------------------------------------------------------

function purchaseFromRpc(raw: unknown): BookPackagePurchase | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.codeId !== "string" || typeof r.projectId !== "string" || !isBookBindingId(r.bindingId)) return null;
  return {
    codeId: r.codeId,
    projectId: r.projectId,
    bindingId: r.bindingId,
    includedPhotos: Number(r.includedPhotos),
    editsPerPhoto: Number(r.editsPerPhoto),
    priceCents: Number(r.priceCents),
    shippingPrepaidCents: Number(r.shippingPrepaidCents) || 0,
    created: r.created === true,
    ...(typeof r.creditsBalanceCents === "number" ? { creditsBalanceCents: r.creditsBalanceCents } : {}),
  };
}

async function recordAlbumCreated(userId: string, projectId: string, albumName: string) {
  await recordActivity({
    userId,
    category: "albums",
    type: "album_created",
    description: `Created album ${quoted(albumName, "Untitled album")}`,
    referenceType: "library_project",
    referenceId: projectId,
  });
}

/**
 * Buys a package from the wallet. The price is read from the catalog inside the same database
 * transaction that debits the wallet and creates the album and the package.
 */
export async function buyPackageWithCredit(input: {
  userId: string;
  bindingId: BookBindingId;
  albumName?: string | null;
  /** What the screen showed. Only a guard: a different catalog price refuses the purchase. */
  expectedPriceCents?: number | null;
  /** Pay the book's standard shipping now too. */
  shipping?: BookPackageShippingInput | null;
}): Promise<ApiResult<BookPackagePurchase>> {
  const pkg = await buyablePackage(input.bindingId);
  if (pkg.error) return pkg;
  const guard = priceGuard(pkg.data!, input.expectedPriceCents);
  if (guard) return guard;
  const shipping = await settleShipping(input.userId, input.bindingId, input.shipping);
  if (shipping.error) return shipping;

  const albumName = cleanAlbumName(input.albumName, input.bindingId);
  const { data, error } = await db().rpc("buy_book_package_with_credits", {
    p_user_id: input.userId,
    p_binding_id: input.bindingId,
    p_project_name: albumName,
    p_expected_price_cents: pkg.data!.priceCents,
    // Only sent when shipping is paid, so a purchase without it also works before migration 0047.
    ...(shipping.data ? { p_shipping_cents: shipping.data.shippingCents } : {}),
  });
  if (error) {
    const message = error.message ?? "";
    if (message.includes("insufficient credits")) {
      return { data: null, error: { message: "Your credit doesn't cover this book.", code: "INSUFFICIENT_CREDITS" } };
    }
    if (message.includes("price changed")) {
      return { data: null, error: { message: "The price of this book changed.", code: PACKAGE_PRICE_CHANGED_CODE } };
    }
    if (message.includes("package not available")) {
      return { data: null, error: { message: "That book isn't available right now.", code: PACKAGE_UNAVAILABLE_CODE } };
    }
    log("error", "Book package wallet purchase failed", { userId: input.userId, bindingId: input.bindingId, error: message });
    return { data: null, error: { message: "That didn't go through, and you weren't charged." } };
  }
  const purchase = purchaseFromRpc(data);
  if (!purchase) return { data: null, error: { message: "That didn't go through. Please check your albums." } };
  log("info", "Book package bought with credit", {
    userId: input.userId,
    codeId: purchase.codeId,
    bindingId: purchase.bindingId,
    priceCents: purchase.priceCents,
    shippingPrepaidCents: purchase.shippingPrepaidCents,
  });
  await recordAlbumCreated(input.userId, purchase.projectId, albumName);
  return { data: purchase, error: null };
}

// ---- buying by card --------------------------------------------------------------------------

/**
 * A Stripe Checkout for the package. The amount is the catalog price read here; nothing about
 * the price comes from the browser. Money paid here goes to the package, never to the wallet.
 */
export async function createPackageCheckout(input: {
  userId: string;
  email: string;
  bindingId: BookBindingId;
  albumName?: string | null;
  expectedPriceCents?: number | null;
  shipping?: BookPackageShippingInput | null;
}): Promise<ApiResult<{ checkoutUrl: string }>> {
  const pkg = await buyablePackage(input.bindingId);
  if (pkg.error) return pkg;
  const guard = priceGuard(pkg.data!, input.expectedPriceCents);
  if (guard) return guard;
  const shipping = await settleShipping(input.userId, input.bindingId, input.shipping);
  if (shipping.error) return shipping;
  const shippingCents = shipping.data?.shippingCents ?? 0;
  const p = pkg.data!;
  const spec = BOOK_BINDINGS[p.bindingId];
  const albumName = cleanAlbumName(input.albumName, p.bindingId);

  const base = `${appOrigin()}/studio/new`;
  const successUrl = `${base}?step=paid&${PACKAGE_CHECKOUT_SESSION_PARAM}={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${base}?book=${encodeURIComponent(p.bindingId)}&step=pay&package=canceled`;

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      customer_email: input.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: p.priceCents,
            product_data: {
              name: `Colorful Memories book package: ${spec.shortLabel}`,
              description: `${p.includedPhotos} photos made into coloring pages, ${p.editsPerPhoto} free touch-ups on each, and printing.${
                shippingCents > 0 ? "" : " Shipping is added when you order the book."
              }`,
            },
          },
        },
        ...(shippingCents > 0
          ? [
              {
                quantity: 1,
                price_data: {
                  currency: "usd",
                  unit_amount: shippingCents,
                  product_data: {
                    name: "Standard shipping for your book",
                    description: "Shipping and tax to the address you entered, paid now so the book is fully paid.",
                  },
                },
              },
            ]
          : []),
      ],
      metadata: {
        kind: BOOK_PACKAGE_CHECKOUT_KIND,
        binding_id: p.bindingId,
        user_id: input.userId,
        album_name: albumName,
        included_photos: String(p.includedPhotos),
        edits_per_photo: String(p.editsPerPhoto),
        amount_cents: String(p.priceCents + shippingCents),
        shipping_cents: String(shippingCents),
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
    if (!session.url) return { data: null, error: { message: "Stripe did not return a checkout URL" } };
    return { data: { checkoutUrl: session.url }, error: null };
  } catch (e) {
    log("error", "Book package checkout could not start", { userId: input.userId, error: e instanceof Error ? e.message : String(e) });
    return { data: null, error: { message: "We couldn't open the payment page. You weren't charged." } };
  }
}

type CheckoutSessionLike = {
  id: string;
  metadata?: Record<string, string> | null;
  payment_status?: string;
  amount_total?: number | null;
  currency?: string | null;
};

type PackageMetadata = {
  userId: string;
  bindingId: BookBindingId;
  albumName: string;
  includedPhotos: number | null;
  editsPerPhoto: number | null;
  shippingCents: number;
};

/** What a package checkout was sold as, or null when it is not one of ours. */
function readPackageMetadata(session: Pick<CheckoutSessionLike, "metadata">): PackageMetadata | null {
  const m = session.metadata;
  if (!m || m.kind !== BOOK_PACKAGE_CHECKOUT_KIND) return null;
  if (!m.user_id || !isBookBindingId(m.binding_id)) return null;
  const toInt = (v: string | undefined) => {
    const n = v ? Number.parseInt(v, 10) : NaN;
    return Number.isInteger(n) ? n : null;
  };
  return {
    userId: m.user_id,
    bindingId: m.binding_id,
    albumName: cleanAlbumName(m.album_name, m.binding_id),
    includedPhotos: toInt(m.included_photos),
    editsPerPhoto: toInt(m.edits_per_photo),
    shippingCents: Math.max(0, toInt(m.shipping_cents) ?? 0),
  };
}

/** True for a Stripe checkout that buys a book package (whether or not it is paid yet). */
export function isBookPackageCheckout(session: Pick<CheckoutSessionLike, "metadata">): boolean {
  return session.metadata?.kind === BOOK_PACKAGE_CHECKOUT_KIND;
}

/**
 * Turns a paid package checkout into the album and its package. Called by the webhook and by the
 * return page, in any order and any number of times: the database creates the package once per
 * checkout and answers later calls with the same package (`created: false`). No wallet movement.
 */
export async function fulfillPackageFromCheckoutSession(
  session: CheckoutSessionLike,
): Promise<ApiResult<BookPackagePurchase>> {
  const meta = readPackageMetadata(session);
  if (!meta) {
    return { data: null, error: { message: "Checkout session is not a book package", code: NOT_BOOK_PACKAGE_CODE } };
  }
  if (session.payment_status !== "paid") {
    return { data: null, error: { message: "Checkout session is not paid", code: PACKAGE_PAYMENT_PENDING_CODE } };
  }
  // What Stripe actually collected is the price of record, not anything in the metadata.
  const amountCents = session.amount_total;
  if (!Number.isInteger(amountCents) || (amountCents as number) <= 0 || session.currency?.toLowerCase() !== "usd") {
    log("error", "Book package checkout has an unexpected amount", { stripeCheckoutSessionId: session.id });
    return { data: null, error: { message: "Invalid checkout amount" } };
  }

  const { data, error } = await db().rpc("create_book_package_from_stripe", {
    p_session_id: session.id,
    p_user_id: meta.userId,
    p_binding_id: meta.bindingId,
    p_amount_cents: amountCents,
    p_project_name: meta.albumName,
    p_included_photos: meta.includedPhotos,
    p_edits_per_photo: meta.editsPerPhoto,
    ...(meta.shippingCents > 0 ? { p_shipping_cents: meta.shippingCents } : {}),
  });
  if (error) {
    log("error", "Book package could not be created from a paid checkout", {
      userId: meta.userId,
      stripeCheckoutSessionId: session.id,
      error: error.message,
    });
    return { data: null, error: { message: error.message } };
  }
  const purchase = purchaseFromRpc(data);
  if (!purchase) return { data: null, error: { message: "Package could not be read back" } };
  if (purchase.created) {
    log("info", "Book package created from checkout", {
      userId: meta.userId,
      codeId: purchase.codeId,
      stripeCheckoutSessionId: session.id,
      bindingId: purchase.bindingId,
      priceCents: purchase.priceCents,
    });
    await recordAlbumCreated(meta.userId, purchase.projectId, meta.albumName);
  }
  return { data: purchase, error: null };
}

/** Back from Stripe: ask Stripe what happened and make the package if it was paid. */
export async function confirmPackageCheckout(input: {
  userId: string;
  sessionId: string;
}): Promise<ApiResult<BookPackageConfirmation>> {
  const notFound = { data: null, error: { message: "We could not find that payment", code: "NOT_FOUND" } } as const;
  if (!CHECKOUT_SESSION_ID_RE.test(input.sessionId)) return notFound;

  let session: Stripe.Checkout.Session;
  try {
    session = await getStripe().checkout.sessions.retrieve(input.sessionId);
  } catch (e) {
    if ((e as { code?: string } | null)?.code === "resource_missing") return notFound;
    log("error", "Stripe checkout lookup failed", {
      userId: input.userId,
      stripeCheckoutSessionId: input.sessionId,
      error: e instanceof Error ? e.message : String(e),
    });
    return { data: null, error: { message: "Could not reach Stripe to confirm the payment", code: "UNAVAILABLE" } };
  }

  // Someone else's checkout looks the same as one that does not exist.
  const meta = readPackageMetadata(session);
  if (!meta || meta.userId !== input.userId) return notFound;

  if (session.status === "expired") {
    return { data: null, error: { message: "That payment expired", code: "EXPIRED" } };
  }
  if (session.status !== "complete") {
    return { data: null, error: { message: "That payment was not completed", code: "NOT_PAID" } };
  }

  const result = await fulfillPackageFromCheckoutSession({
    id: session.id,
    metadata: session.metadata,
    payment_status: session.payment_status,
    amount_total: session.amount_total,
    currency: session.currency,
  });
  if (result.error) {
    if (result.error.code === PACKAGE_PAYMENT_PENDING_CODE) return { data: { status: "pending" }, error: null };
    return { data: null, error: result.error };
  }
  return { data: { status: "ready", purchase: result.data! }, error: null };
}

// ---- canceling (refund to the wallet) --------------------------------------------------------

function refundQuoteFromRpc(raw: unknown): BookPackageRefundQuote | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.codeId !== "string" || !isBookBindingId(r.bindingId)) return null;
  return {
    codeId: r.codeId,
    bindingId: r.bindingId,
    pricePaidCents: Number(r.pricePaidCents) || 0,
    shippingPrepaidCents: Number(r.shippingPrepaidCents) || 0,
    pagesUsed: Number(r.pagesUsed) || 0,
    pagePriceCents: Number(r.pagePriceCents) || 0,
    pagesChargedCents: Number(r.pagesChargedCents) || 0,
    refundCents: Number(r.refundCents) || 0,
    cancelable: r.cancelable === true,
    bookOrdered: r.bookOrdered === true,
    refunded: r.refunded === true,
    isBuyer: r.isBuyer === true,
  };
}

/** What canceling the album's package would return now; null when the album has no package. */
export async function getPackageRefundQuote(
  userId: string,
  projectId: string,
): Promise<ApiResult<BookPackageRefundQuote | null>> {
  const { data, error } = await db().rpc("book_package_refund_quote", { p_user_id: userId, p_project_id: projectId });
  if (error) {
    log("error", "Book package refund quote failed", { userId, projectId, error: error.message });
    return { data: null, error: { message: "We couldn't check your book package just now." } };
  }
  return { data: refundQuoteFromRpc(data), error: null };
}

/**
 * Cancel the album's book package: its unused value goes back to the wallet in one transaction
 * (see cancel_book_package). With `deleteAlbum`, the album and its pages are deleted afterwards;
 * otherwise it stays as an ordinary pay-as-you-go album with every page kept.
 */
export async function cancelBookPackage(input: {
  userId: string;
  projectId: string;
  deleteAlbum: boolean;
  /** Removes the album and its files; passed in to keep this module free of library code. */
  deleteProject: (userId: string, projectId: string) => Promise<ApiResult<{ id: string }>>;
}): Promise<ApiResult<BookPackageRefund>> {
  const { data, error } = await db().rpc("cancel_book_package", {
    p_user_id: input.userId,
    p_project_id: input.projectId,
  });
  if (error) {
    const message = error.message ?? "";
    const notCancelable: Record<string, string> = {
      "book already ordered": "Your book has already been ordered with this package, so it can't be canceled.",
      "already refunded": "This package was already canceled and refunded.",
      "not the buyer": "Only the person who bought this book can cancel it.",
      "package not active": "This package can't be canceled.",
      "no package": "This album doesn't have a book package.",
    };
    const known = Object.keys(notCancelable).find((k) => message.includes(k));
    if (known) return { data: null, error: { message: notCancelable[known], code: PACKAGE_NOT_CANCELABLE_CODE } };
    log("error", "Book package cancel failed", { userId: input.userId, projectId: input.projectId, error: message });
    return { data: null, error: { message: "We couldn't cancel your package. Nothing was changed." } };
  }
  const r = (data ?? {}) as Record<string, unknown>;
  const refund: BookPackageRefund = {
    refundCents: Number(r.refundCents) || 0,
    pagesUsed: Number(r.pagesUsed) || 0,
    pagesChargedCents: Number(r.pagesChargedCents) || 0,
    creditsBalanceCents: Number(r.creditsBalanceCents) || 0,
    albumDeleted: false,
  };
  log("info", "Book package canceled", { userId: input.userId, projectId: input.projectId, ...refund });

  if (input.deleteAlbum) {
    // The refund is already done; if the delete fails the album simply stays, as a normal album.
    const deleted = await input.deleteProject(input.userId, input.projectId);
    if (deleted.error) {
      log("error", "Album delete after package cancel failed", {
        userId: input.userId,
        projectId: input.projectId,
        error: deleted.error.message,
      });
    } else {
      refund.albumDeleted = true;
    }
  }
  return { data: refund, error: null };
}
