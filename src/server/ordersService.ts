import type { ApiResult } from "@/lib/api/types";
import {
  buildFulfillmentTimeline,
  formatDeliveryExpectation,
  statusLabel,
} from "@/lib/orders/fulfillmentTimeline";
import { bookStatusFromLulu } from "@/lib/orders/luluStatusMap";
import type {
  BookOrderDetail,
  BookOrderEvent,
  BookOrderStatus,
  BookOrderSummary,
  BookFulfillment,
  BookPaymentMethod,
  ShippingAddress,
} from "@/lib/orders/types";
import { isShippingAddressComplete, normalizeShippingAddress } from "@/lib/orders/shippingAddress";
import type { DigitalBookPage } from "@/lib/orders/types";
import { bindingIdForProduct, type BookBindingId } from "@/lib/print/bookBindings";
import { normalizeCoverDesign, type BookCoverDesign } from "@/lib/print/bookCover";
import type { SignedUpload } from "@/lib/library/types";
import { buildPrintFiles, createCoverFrontUpload, parsePrintPages } from "@/server/printBookService";
import { getSupabaseAdmin } from "@/lib/supabase/service";
import { quoted, recordActivity } from "@/server/activityService";
import { luluConfigured } from "@/server/lulu/config";
import { pricePrintOrder } from "@/server/pricingService";
import type { AdminUserOrderSummary } from "@/lib/orders/adminTypes";
import {
  cancelLuluPrintJob,
  createLuluPrintJob,
  extractTrackingFromPrintJob,
  fetchLuluPrintJob,
} from "@/server/lulu/printJobs";
import { buildLuluPrintJobPayload, validateLuluPayload } from "@/lib/print/luluPayload";
import { getBookBinding } from "@/lib/print/bookBindings";
import { signedReadUrls } from "@/server/storage/libraryFiles";
import { clientOrigin } from "@/lib/auth/clientOrigin";
import { getSupabaseAuth } from "@/lib/supabase/service";
import { sendEmail } from "@/server/email/resend";
import { orderConfirmationEmail } from "@/server/email/orderConfirmationEmail";
import { orderCanceledEmail } from "@/server/email/orderCanceledEmail";
import { formatShippingAddress } from "@/lib/orders/shippingAddress";
import {
  ADMIN_CANCELABLE_STATUSES,
  CUSTOMER_CANCELABLE_STATUSES,
  DEAD_LULU_STATUSES,
  customerCanCancel,
} from "@/lib/orders/cancelWindow";

/** Lulu fetches the print PDFs asynchronously (can be hours later); keep the links alive 7 days. */
const PRINT_FILE_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

type OrderRow = {
  id: string;
  user_id: string;
  product_id: string;
  project_title: string | null;
  page_count: number;
  status: BookOrderStatus;
  fulfillment?: BookFulfillment | null;
  payment_method: BookPaymentMethod | null;
  total_cents: number | null;
  shipping_level: string;
  lulu_status_name: string | null;
  lulu_status_message: string | null;
  lulu_print_job_id: number | null;
  tracking_number: string | null;
  tracking_urls: string[] | null;
  carrier: string | null;
  estimated_delivery_min: string | null;
  estimated_delivery_max: string | null;
  estimated_dispatch_min: string | null;
  estimated_dispatch_max: string | null;
  contact_email: string;
  shipping_address: ShippingAddress;
  billing_address?: ShippingAddress | null;
  is_gift?: boolean | null;
  gift_note?: string | null;
  cover_pdf_path?: string | null;
  paid_at: string | null;
  submitted_to_lulu_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
  lulu_production_due_at?: string | null;
  refunded_cents?: number | null;
  canceled_at?: string | null;
  cancel_reason?: string | null;
  print_products?: { name: string } | { name: string }[] | null;
};

type EventRow = {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  occurred_at: string;
};

function productName(row: OrderRow): string {
  const p = row.print_products;
  if (!p) return "Coloring book";
  if (Array.isArray(p)) return p[0]?.name ?? "Coloring book";
  return p.name;
}

function mapSummary(row: OrderRow): BookOrderSummary {
  return {
    id: row.id,
    projectTitle: row.project_title,
    productId: row.product_id,
    productName: productName(row),
    pageCount: row.page_count,
    status: row.status,
    fulfillment: row.fulfillment ?? "print",
    luluStatusName: row.lulu_status_name,
    shippingLevel: row.shipping_level,
    totalCents: row.total_cents,
    paymentMethod: row.payment_method,
    estimatedDeliveryMin: row.estimated_delivery_min,
    estimatedDeliveryMax: row.estimated_delivery_max,
    trackingNumber: row.tracking_number,
    trackingUrls: row.tracking_urls ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    luluProductionDueAt: row.lulu_production_due_at ?? null,
    canCancel: customerCanCancel({
      status: row.status,
      fulfillment: row.fulfillment ?? "print",
      luluStatusName: row.lulu_status_name,
      luluProductionDueAt: row.lulu_production_due_at ?? null,
    }),
    refundedCents: row.refunded_cents ?? null,
  };
}

function mapEvents(rows: EventRow[]): BookOrderEvent[] {
  return rows.map((e) => ({
    id: e.id,
    kind: e.kind,
    title: e.title,
    detail: e.detail,
    occurredAt: e.occurred_at,
  }));
}

function mapDetail(row: OrderRow, events: EventRow[]): BookOrderDetail {
  const summary = mapSummary(row);
  const timeline = buildFulfillmentTimeline({
    status: row.status,
    paidAt: row.paid_at,
    submittedToLuluAt: row.submitted_to_lulu_at,
    shippedAt: row.shipped_at,
    deliveredAt: row.delivered_at,
  });
  return {
    ...summary,
    contactEmail: row.contact_email,
    shippingAddress: row.shipping_address,
    billingAddress: row.billing_address ?? null,
    isGift: row.is_gift === true,
    giftNote: row.gift_note ?? null,
    hasPrintFiles: Boolean(row.cover_pdf_path),
    carrier: row.carrier,
    estimatedDispatchMin: row.estimated_dispatch_min,
    estimatedDispatchMax: row.estimated_dispatch_max,
    paidAt: row.paid_at,
    submittedToLuluAt: row.submitted_to_lulu_at,
    shippedAt: row.shipped_at,
    deliveredAt: row.delivered_at,
    luluStatusMessage: row.lulu_status_message,
    luluPrintJobId: row.lulu_print_job_id,
    canceledAt: row.canceled_at ?? null,
    cancelReason: row.cancel_reason ?? null,
    timeline,
    events: mapEvents(events),
    deliveryExpectation: formatDeliveryExpectation(
      row.estimated_delivery_min,
      row.estimated_delivery_max,
      row.status,
    ),
  };
}

async function appendOrderEvent(
  orderId: string,
  input: { kind: string; title: string; detail?: string; metadata?: Record<string, unknown> },
): Promise<void> {
  await getSupabaseAdmin().from("book_order_events").insert({
    order_id: orderId,
    kind: input.kind,
    title: input.title,
    detail: input.detail ?? null,
    metadata: input.metadata ?? {},
  });
}

/**
 * The order's price columns from a fresh Lulu quote to its shipping address,
 * marked up per the price catalog. The only place a print order's total is set:
 * the browser's estimate is never trusted.
 */
async function pricedOrderColumns(input: {
  bindingId: BookBindingId;
  pageCount: number;
  shippingAddress: ShippingAddress;
  shippingLevel: string;
}): Promise<ApiResult<Record<string, unknown>>> {
  const a = input.shippingAddress;
  let priced;
  try {
    priced = await pricePrintOrder({
      bindingId: input.bindingId,
      pageCount: input.pageCount,
      shippingLevel: input.shippingLevel,
      shippingAddress: {
        city: a.city,
        state_code: a.state_code ?? "",
        postcode: a.postcode,
        country_code: a.country_code,
      },
    });
  } catch (e) {
    priced = { data: null, error: { message: e instanceof Error ? e.message : "Lulu quote failed" } };
  }
  if (priced.error) {
    return {
      data: null,
      error: { message: "We couldn't get a price from the printer. Please try again in a moment.", code: "QUOTE_UNAVAILABLE" },
    };
  }
  const { price, sku, markupPct, shippingLevel } = priced.data;
  return {
    data: {
      price_sku: sku,
      lulu_cost_cents: price.costTotalCents,
      subtotal_cents: price.printPriceCents,
      shipping_cents: price.shippingCents,
      tax_cents: price.taxCents,
      markup_pct: markupPct,
      markup_cents: price.markupCents,
      total_cents: price.totalCents,
      shipping_level: shippingLevel,
    },
    error: null,
  };
}

/** What the wizard saves about the book itself, alongside price and addresses. */
export type DraftBookContent = {
  /** Every printed page in order, padding included. */
  printPages?: DigitalBookPage[] | null;
  coverDesign?: BookCoverDesign | null;
  billingAddress?: ShippingAddress | null;
  /** The customer flipped through the whole book and said it's right. */
  proofConfirmed?: boolean;
  /** Sent to someone else; its note, if any, is the first print page. */
  isGift?: boolean;
};

function draftContentColumns(input: DraftBookContent) {
  const first = input.printPages?.[0];
  return {
    is_gift: input.isGift === true,
    // Kept beside the pages so support and reports can read it without parsing the page list.
    gift_note: first?.kind === "note" ? first.text : null,
    print_pages: input.printPages ?? null,
    cover_design: input.coverDesign ?? null,
    billing_address: input.billingAddress ? normalizeShippingAddress(input.billingAddress) : null,
    proof_confirmed_at: input.proofConfirmed ? new Date().toISOString() : null,
  };
}

export async function createDraftBookOrder(input: DraftBookContent & {
  userId: string;
  contactEmail: string;
  productId: string;
  pageCount: number;
  projectTitle: string;
  shippingPostcode?: string | null;
  /** Full address when the customer has entered one; wins over the quote postcode. */
  shippingAddress?: ShippingAddress | null;
}): Promise<ApiResult<{ orderId: string }>> {
  const { data, error } = await getSupabaseAdmin()
    .from("book_orders")
    .insert({
      user_id: input.userId,
      product_id: input.productId,
      project_title: input.projectTitle,
      page_count: input.pageCount,
      status: "draft",
      contact_email: input.contactEmail,
      // Priced when the order is confirmed, from the printer's quote; never from the browser.
      lulu_cost_cents: null,
      total_cents: null,
      shipping_address: input.shippingAddress
        ? normalizeShippingAddress(input.shippingAddress)
        : shippingAddressFromQuotePostcode(input.shippingPostcode),
      ...draftContentColumns(input),
    })
    .select("id")
    .single();

  if (error) {
    return { data: null, error: { message: error.message } };
  }

  await appendOrderEvent(data.id as string, {
    kind: "draft_created",
    title: "Book draft saved",
    detail: `${input.pageCount} pages configured — checkout coming soon.`,
  });

  return { data: { orderId: data.id as string }, error: null };
}

function shippingAddressFromQuotePostcode(postcode: string | null | undefined): ShippingAddress {
  const trimmed = postcode?.trim();
  if (!trimmed) return {} as ShippingAddress;
  return {
    name: "",
    street1: "",
    city: "",
    postcode: trimmed.replace(/\D/g, "").slice(0, 5) || trimmed,
    country_code: "US",
    phone_number: "",
  };
}

async function getOwnedDraftOrder(
  userId: string,
  orderId: string,
): Promise<ApiResult<OrderRow>> {
  const { data, error } = await getSupabaseAdmin()
    .from("book_orders")
    .select("*")
    .eq("id", orderId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    return { data: null, error: { message: error.message } };
  }
  if (!data) {
    return { data: null, error: { message: "Order not found", code: "NOT_FOUND" } };
  }
  const row = data as OrderRow;
  if (row.status !== "draft") {
    return {
      data: null,
      error: { message: "Only draft orders can be edited here", code: "INVALID_STATE" },
    };
  }
  return { data: row, error: null };
}

export async function updateDraftBookOrder(input: DraftBookContent & {
  userId: string;
  orderId: string;
  productId: string;
  pageCount: number;
  projectTitle: string;
  shippingPostcode?: string | null;
  shippingAddress?: ShippingAddress | null;
}): Promise<ApiResult<{ orderId: string }>> {
  const owned = await getOwnedDraftOrder(input.userId, input.orderId);
  if (owned.error) return { data: null, error: owned.error };

  const mergedAddress: ShippingAddress = input.shippingAddress
    ? normalizeShippingAddress(input.shippingAddress)
    : {
        ...((owned.data!.shipping_address ?? {}) as ShippingAddress),
        ...shippingAddressFromQuotePostcode(input.shippingPostcode),
      };

  const { error } = await getSupabaseAdmin()
    .from("book_orders")
    .update({
      product_id: input.productId,
      project_title: input.projectTitle,
      page_count: input.pageCount,
      // Priced when the order is confirmed, from the printer's quote; never from the browser.
      lulu_cost_cents: null,
      total_cents: null,
      shipping_address: mergedAddress,
      ...draftContentColumns(input),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.orderId)
    .eq("user_id", input.userId)
    .eq("status", "draft");

  if (error) {
    return { data: null, error: { message: error.message } };
  }

  await appendOrderEvent(input.orderId, {
    kind: "draft_updated",
    title: "Book draft updated",
    detail: `${input.pageCount} pages — ready when you confirm.`,
  });

  return { data: { orderId: input.orderId }, error: null };
}

export async function updateOrderShippingAddress(input: {
  userId: string;
  orderId: string;
  shippingAddress: ShippingAddress;
}): Promise<ApiResult<{ orderId: string }>> {
  const { data: order, error: loadError } = await getSupabaseAdmin()
    .from("book_orders")
    .select("id, user_id, status, product_id, page_count, shipping_level")
    .eq("id", input.orderId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (loadError) return { data: null, error: { message: loadError.message } };
  if (!order) return { data: null, error: { message: "Order not found", code: "NOT_FOUND" } };
  if (order.status !== "draft" && order.status !== "awaiting_payment") {
    return {
      data: null,
      error: { message: "The address can't be changed once the order is placed.", code: "INVALID_STATE" },
    };
  }

  // A new destination changes shipping and tax, so a confirmed order is priced again.
  const shippingAddress = normalizeShippingAddress(input.shippingAddress);
  let pricing: Record<string, unknown> = {};
  const bindingId = bindingIdForProduct(order.product_id as string);
  if (order.status === "awaiting_payment" && bindingId) {
    const priced = await pricedOrderColumns({
      bindingId,
      pageCount: order.page_count as number,
      shippingAddress,
      shippingLevel: order.shipping_level as string,
    });
    if (priced.error) return { data: null, error: priced.error };
    pricing = priced.data;
  }

  const { error } = await getSupabaseAdmin()
    .from("book_orders")
    .update({
      ...pricing,
      shipping_address: shippingAddress,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.orderId)
    .eq("user_id", input.userId);
  if (error) return { data: null, error: { message: error.message } };

  await appendOrderEvent(input.orderId, {
    kind: "shipping_address_updated",
    title: "Shipping address updated",
  });
  return { data: { orderId: input.orderId }, error: null };
}

export async function confirmDraftBookOrder(input: {
  userId: string;
  orderId: string;
}): Promise<ApiResult<{ orderId: string; status: BookOrderStatus }>> {
  const owned = await getOwnedDraftOrder(input.userId, input.orderId);
  if (owned.error) return { data: null, error: owned.error };

  if (!isShippingAddressComplete(owned.data!.shipping_address as Partial<ShippingAddress>)) {
    return {
      data: null,
      error: { message: "Add a shipping address before confirming the order.", code: "ADDRESS_REQUIRED" },
    };
  }

  // The print files are built before anything is charged, so a book that can't
  // be printed never reaches payment.
  const draft = owned.data! as OrderRow & {
    print_pages?: unknown;
    cover_design?: unknown;
    proof_confirmed_at?: string | null;
  };
  const bindingId = bindingIdForProduct(draft.product_id);
  const pages = bindingId ? parsePrintPages(draft.print_pages, bindingId) : null;
  if (!bindingId || !pages?.data || pages.data.length !== draft.page_count || !draft.cover_design) {
    return {
      data: null,
      error: {
        message: "This book needs its pages and cover set up again. Please create it from the studio.",
        code: "BOOK_INCOMPLETE",
      },
    };
  }
  if (!draft.proof_confirmed_at) {
    return {
      data: null,
      error: { message: "Flip through the book and confirm it looks right before ordering.", code: "PROOF_REQUIRED" },
    };
  }
  const [files, pricing] = await Promise.all([
    buildPrintFiles({
      userId: input.userId,
      orderId: input.orderId,
      bindingId,
      pages: pages.data,
      cover: normalizeCoverDesign(draft.cover_design),
    }),
    pricedOrderColumns({
      bindingId,
      pageCount: draft.page_count,
      shippingAddress: draft.shipping_address,
      shippingLevel: draft.shipping_level,
    }),
  ]);
  if (files.error) return { data: null, error: files.error };
  if (pricing.error) return { data: null, error: pricing.error };

  const { error } = await getSupabaseAdmin()
    .from("book_orders")
    .update({
      ...pricing.data,
      status: "awaiting_payment",
      interior_pdf_path: files.data!.interiorPdfPath,
      cover_pdf_path: files.data!.coverPdfPath,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.orderId)
    .eq("user_id", input.userId)
    .eq("status", "draft");

  if (error) {
    return { data: null, error: { message: error.message } };
  }

  const register = await registerBookOrderJob(input.userId, input.orderId);
  if (register.error) return { data: null, error: register.error };

  await appendOrderEvent(input.orderId, {
    kind: "checkout_confirmed",
    title: "Ready for checkout",
    detail: "Your book is registered — add credits and place the order when you're ready.",
  });

  return { data: { orderId: input.orderId, status: "awaiting_payment" }, error: null };
}

/** Registers fulfillment metadata (Lulu external id) without charging the wallet. */
export async function registerBookOrderJob(
  userId: string,
  orderId: string,
): Promise<ApiResult<{ orderId: string }>> {
  const { data: order, error } = await getSupabaseAdmin()
    .from("book_orders")
    .select("id, user_id, status, lulu_external_id, total_cents, page_count")
    .eq("id", orderId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return { data: null, error: { message: error.message } };
  if (!order) {
    return { data: null, error: { message: "Order not found", code: "NOT_FOUND" } };
  }
  if (order.status !== "awaiting_payment" && order.status !== "draft") {
    return {
      data: null,
      error: { message: "Order cannot be registered in its current state", code: "INVALID_STATE" },
    };
  }

  const externalId = (order.lulu_external_id as string | null) ?? orderId;

  const { error: updateError } = await getSupabaseAdmin()
    .from("book_orders")
    .update({
      lulu_external_id: externalId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("user_id", userId);

  if (updateError) return { data: null, error: { message: updateError.message } };

  if (!order.lulu_external_id) {
    await appendOrderEvent(orderId, {
      kind: "job_registered",
      title: "Print job registered",
      detail: `${order.page_count} pages queued for fulfillment once you place the order.`,
      metadata: { luluExternalId: externalId },
    });
  }

  return { data: { orderId }, error: null };
}

export async function placeBookOrderWithCredits(input: {
  userId: string;
  orderId: string;
}): Promise<
  ApiResult<{
    orderId: string;
    status: BookOrderStatus;
    creditsBalanceCents: number;
    creditsAppliedCents: number;
  }>
> {
  const { data, error } = await getSupabaseAdmin().rpc("place_book_order_with_credits", {
    p_user_id: input.userId,
    p_order_id: input.orderId,
  });

  if (error) {
    const message = error.message.includes("insufficient credits")
      ? "You do not have enough credits to place this order"
      : error.message.includes("order not found")
        ? "Order not found"
        : error.message.includes("not awaiting payment")
          ? "This order is not ready to place"
          : error.message;
    const code = error.message.includes("insufficient credits")
      ? "INSUFFICIENT_CREDITS"
      : error.message.includes("order not found")
        ? "NOT_FOUND"
        : error.message.includes("not awaiting payment")
          ? "INVALID_STATE"
          : undefined;
    return { data: null, error: { message, ...(code ? { code } : {}) } };
  }

  const payload = data as {
    orderId: string;
    status: BookOrderStatus;
    creditsBalanceCents: number;
    creditsAppliedCents: number;
  };

  await recordOrderPlacedEvent(input.orderId);

  return { data: payload, error: null };
}

/**
 * Emails the customer their order details once a printed-book order is placed. Idempotent: a
 * `confirmation_email_sent` order event marks it done, and an order that already has one is
 * skipped. Never throws and never affects the order; a failed send is logged and can be retried
 * by the next caller.
 */
export async function sendOrderConfirmationEmail(orderId: string): Promise<void> {
  try {
    const db = getSupabaseAdmin();
    const { data: sent } = await db
      .from("book_order_events")
      .select("id")
      .eq("order_id", orderId)
      .eq("kind", "confirmation_email_sent")
      .limit(1);
    if (sent && sent.length > 0) return;

    const { data: order } = await db.from("book_orders").select("*").eq("id", orderId).maybeSingle();
    if (!order || order.deleted_at) return;
    if ((order.fulfillment ?? "print") === "digital") return;
    if (order.status === "draft" || order.status === "quoted" || order.status === "awaiting_payment") return;

    let to = ((order.contact_email as string | null) ?? "").trim();
    if (!to) {
      const { data: auth } = await getSupabaseAuth().auth.admin.getUserById(order.user_id as string);
      to = auth.user?.email?.trim() ?? "";
    }
    if (!to) {
      console.error(`[orders] confirmation email ${orderId}: no recipient`);
      return;
    }

    const bindingId = bindingIdForProduct(order.product_id as string);
    const address = order.shipping_address as ShippingAddress | null;
    const shipTo = address
      ? [
          address.name,
          [address.street1, address.street2].filter(Boolean).join(", "),
          [address.city, address.state_code, address.postcode].filter(Boolean).join(" "),
          address.country_code && address.country_code !== "US" ? address.country_code : "",
        ].filter(Boolean)
      : [formatShippingAddress(address) || "On file"];
    const ok = await sendEmail(
      orderConfirmationEmail({
        to,
        orderId,
        title: (order.project_title as string | null)?.trim() || "Coloring book",
        bindingLabel: bindingId ? getBookBinding(bindingId).shortLabel : "Printed book",
        pageCount: order.page_count as number,
        isGift: order.is_gift === true,
        shipTo,
        printCents: order.subtotal_cents as number | null,
        shippingCents: order.shipping_cents as number | null,
        taxCents: order.tax_cents as number | null,
        totalCents: order.total_cents as number | null,
        orderUrl: `${clientOrigin()}/orders/${orderId}`,
        cancelUrl: `${clientOrigin()}/orders/${orderId}?cancel=1`,
      }),
    );
    if (!ok) return;
    await appendOrderEvent(orderId, {
      kind: "confirmation_email_sent",
      title: "Confirmation email sent",
      detail: "We emailed your order details.",
    });
  } catch (e) {
    console.error(`[orders] confirmation email ${orderId} failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Tells the customer their order was canceled and refunded. Once per order; never throws. */
export async function sendOrderCanceledEmail(orderId: string): Promise<void> {
  try {
    const db = getSupabaseAdmin();
    const { data: sent } = await db
      .from("book_order_events")
      .select("id")
      .eq("order_id", orderId)
      .eq("kind", "cancel_email_sent")
      .limit(1);
    if (sent && sent.length > 0) return;

    const { data: order } = await db.from("book_orders").select("*").eq("id", orderId).maybeSingle();
    if (!order || order.status !== "canceled") return;
    // Nothing worth an email for an order that was never paid.
    if (!order.paid_at) return;

    let to = ((order.contact_email as string | null) ?? "").trim();
    if (!to) {
      const { data: auth } = await getSupabaseAuth().auth.admin.getUserById(order.user_id as string);
      to = auth.user?.email?.trim() ?? "";
    }
    if (!to) return;

    const ok = await sendEmail(
      orderCanceledEmail({
        to,
        orderId,
        title: (order.project_title as string | null)?.trim() || "Coloring book",
        refundedCents: (order.refunded_cents as number | null) ?? 0,
        canceledByAdmin: Boolean(order.canceled_by) && order.canceled_by !== order.user_id,
        reason: (order.cancel_reason as string | null) ?? null,
        orderUrl: `${clientOrigin()}/orders/${orderId}`,
      }),
    );
    if (!ok) return;
    await appendOrderEvent(orderId, {
      kind: "cancel_email_sent",
      title: "Cancellation email sent",
      detail: "We emailed you that this order was canceled.",
    });
  } catch (e) {
    console.error(`[orders] cancel email ${orderId} failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Sends a paid physical order to Lulu (POST /print-jobs/). Safe to call twice: the status flip
 * to submitting_to_lulu is conditional, so only one caller proceeds. Never throws; failures set
 * status `failed` (retryable by an admin) and are shown on the order timeline. No auto-refund.
 */
export async function submitOrderToLulu(
  orderId: string,
): Promise<ApiResult<{ status: BookOrderStatus; luluPrintJobId?: number }>> {
  const db = getSupabaseAdmin();
  try {
    const { data: order, error } = await db
      .from("book_orders")
      .select("*")
      .eq("id", orderId)
      .maybeSingle();
    if (error) return { data: null, error: { message: error.message } };
    if (!order) return { data: null, error: { message: "Order not found", code: "NOT_FOUND" } };
    if (order.deleted_at) return { data: null, error: { message: "Order is hidden", code: "INVALID_STATE" } };
    if ((order.fulfillment ?? "print") === "digital") {
      return { data: null, error: { message: "Digital orders are not printed", code: "INVALID_STATE" } };
    }
    if (order.lulu_print_job_id) {
      return { data: { status: order.status as BookOrderStatus, luluPrintJobId: order.lulu_print_job_id }, error: null };
    }
    if (order.status !== "paid" && order.status !== "failed") {
      return { data: null, error: { message: `Order is ${order.status}, not ready to submit`, code: "INVALID_STATE" } };
    }
    if (!luluConfigured()) {
      console.error(`[lulu] submit ${orderId}: Lulu API is not configured`);
      return { data: null, error: { message: "Lulu API is not configured" } };
    }

    // Claim the order: exactly one concurrent caller gets a row back.
    const { data: claimed, error: claimError } = await db
      .from("book_orders")
      .update({ status: "submitting_to_lulu", updated_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("status", order.status)
      .is("lulu_print_job_id", null)
      .select("id");
    if (claimError) return { data: null, error: { message: claimError.message } };
    if (!claimed || claimed.length === 0) {
      return { data: null, error: { message: "Order is already being submitted", code: "INVALID_STATE" } };
    }

    const fail = async (message: string): Promise<ApiResult<never>> => {
      console.error(`[lulu] submit ${orderId} failed: ${message}`);
      await db
        .from("book_orders")
        .update({
          status: "failed",
          lulu_status_message: message.slice(0, 1000),
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);
      await appendOrderEvent(orderId, {
        kind: "lulu_submit_failed",
        title: "Printing hit a snag",
        detail: "We couldn't send your book to the printer yet. Our team has been notified and will retry.",
        metadata: { error: message.slice(0, 1000) },
      });
      return { data: null, error: { message } };
    };

    const bindingId = bindingIdForProduct(order.product_id as string);
    if (!bindingId) return fail(`Unknown print product ${order.product_id}`);
    if (!order.interior_pdf_path || !order.cover_pdf_path) return fail("Order has no print files");

    const address = order.shipping_address as ShippingAddress | null;
    if (!address) return fail("Order has no shipping address");
    const contactEmail = ((order.contact_email as string | null) || address.email || "").trim();

    const urls = await signedReadUrls(
      [order.interior_pdf_path as string, order.cover_pdf_path as string],
      PRINT_FILE_URL_TTL_SECONDS,
    );
    const interiorUrl = urls.get(order.interior_pdf_path as string);
    const coverUrl = urls.get(order.cover_pdf_path as string);
    if (!interiorUrl || !coverUrl) return fail("Could not sign print file URLs");

    const payload = buildLuluPrintJobPayload({
      orderId: (order.lulu_external_id as string | null) ?? orderId,
      title: (order.project_title as string | null) || "Coloring book",
      contactEmail,
      shippingLevel: order.shipping_level as string,
      shippingAddress: address,
      podPackageId: getBookBinding(bindingId).podPackageId,
      interiorUrl,
      coverUrl,
    });
    const invalid = validateLuluPayload(payload);
    if (invalid) return fail(invalid);

    let job;
    try {
      job = await createLuluPrintJob(payload);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Lulu print job creation failed");
    }
    if (typeof job.id !== "number") return fail("Lulu did not return a print job id");

    const now = new Date().toISOString();
    const { error: saveError } = await db
      .from("book_orders")
      .update({
        lulu_print_job_id: job.id,
        lulu_production_due_at: job.production_due_time ?? null,
        lulu_status_name: job.status?.name ?? "CREATED",
        lulu_status_message: job.status?.message ?? null,
        lulu_status_changed_at: now,
        status: "submitted_to_lulu",
        submitted_to_lulu_at: now,
        updated_at: now,
      })
      .eq("id", orderId);
    if (saveError) {
      // The job exists at Lulu; record loudly so it is not submitted again by hand.
      console.error(`[lulu] submit ${orderId}: print job ${job.id} created but DB save failed: ${saveError.message}`);
      return { data: null, error: { message: saveError.message } };
    }

    await appendOrderEvent(orderId, {
      kind: "submitted_to_lulu",
      title: "Sent to the printer",
      detail: "Your book is in the print queue.",
      metadata: { luluPrintJobId: job.id },
    });
    return { data: { status: "submitted_to_lulu", luluPrintJobId: job.id }, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Lulu submission failed";
    console.error(`[lulu] submit ${orderId} threw: ${message}`);
    return { data: null, error: { message } };
  }
}

/** Lulu job states that can never print, so the order may be rebuilt and sent again. */

/**
 * Admin: rebuilds the print PDFs of a failed order from its stored pages and cover, then submits
 * it to Lulu again. Allowed only when the order is `failed` and its Lulu job is dead (or it never
 * had one). The order is claimed with a conditional update before any work starts, so a double
 * click cannot create two print jobs: the second caller finds the order no longer `failed`.
 */
export async function rebuildAndResubmitOrderToLulu(
  orderId: string,
): Promise<ApiResult<{ status: BookOrderStatus; luluPrintJobId?: number }>> {
  const db = getSupabaseAdmin();
  const { data: order, error } = await db.from("book_orders").select("*").eq("id", orderId).maybeSingle();
  if (error) return { data: null, error: { message: error.message } };
  if (!order) return { data: null, error: { message: "Order not found", code: "NOT_FOUND" } };
  if (order.deleted_at) return { data: null, error: { message: "Order is hidden", code: "INVALID_STATE" } };
  if ((order.fulfillment ?? "print") === "digital") {
    return { data: null, error: { message: "Digital orders are not printed", code: "INVALID_STATE" } };
  }
  if (order.status !== "failed") {
    return { data: null, error: { message: `Order is ${order.status}, only failed orders can be rebuilt`, code: "INVALID_STATE" } };
  }
  const oldJobId = order.lulu_print_job_id as number | null;
  const oldLuluStatus = order.lulu_status_name as string | null;
  if (oldJobId && !DEAD_LULU_STATUSES.includes((oldLuluStatus ?? "").toUpperCase())) {
    return {
      data: null,
      error: {
        message: `Lulu job ${oldJobId} is ${oldLuluStatus ?? "still active"}; only rejected or canceled jobs can be replaced`,
        code: "INVALID_STATE",
      },
    };
  }

  const bindingId = bindingIdForProduct(order.product_id as string);
  const pages = bindingId ? parsePrintPages(order.print_pages, bindingId) : null;
  if (!bindingId || !pages?.data || pages.data.length !== order.page_count || !order.cover_design) {
    return {
      data: null,
      error: { message: "This order has no stored pages or cover to rebuild from.", code: "BOOK_INCOMPLETE" },
    };
  }

  // Claim the order: only one concurrent caller gets a row back. Clearing the old job id here is
  // what lets submitOrderToLulu create a new job.
  const now = new Date().toISOString();
  let claim = db
    .from("book_orders")
    .update({
      status: "paid",
      lulu_print_job_id: null,
      lulu_status_name: null,
      lulu_status_message: null,
      lulu_status_changed_at: null,
      submitted_to_lulu_at: null,
      updated_at: now,
    })
    .eq("id", orderId)
    .eq("status", "failed");
  claim = oldJobId ? claim.eq("lulu_print_job_id", oldJobId) : claim.is("lulu_print_job_id", null);
  const { data: claimed, error: claimError } = await claim.select("id");
  if (claimError) return { data: null, error: { message: claimError.message } };
  if (!claimed || claimed.length === 0) {
    return { data: null, error: { message: "Order is already being resubmitted", code: "INVALID_STATE" } };
  }

  const markFailed = async (message: string): Promise<ApiResult<never>> => {
    console.error(`[lulu] rebuild ${orderId} failed: ${message}`);
    await db
      .from("book_orders")
      .update({ status: "failed", lulu_status_message: message.slice(0, 1000), updated_at: new Date().toISOString() })
      .eq("id", orderId);
    return { data: null, error: { message } };
  };

  try {
    const files = await buildPrintFiles({
      userId: order.user_id as string,
      orderId,
      bindingId,
      pages: pages.data,
      cover: normalizeCoverDesign(order.cover_design),
    });
    if (files.error) return await markFailed(files.error.message);

    const { error: saveError } = await db
      .from("book_orders")
      .update({
        interior_pdf_path: files.data!.interiorPdfPath,
        cover_pdf_path: files.data!.coverPdfPath,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);
    if (saveError) return await markFailed(saveError.message);
  } catch (e) {
    return await markFailed(e instanceof Error ? e.message : "Could not rebuild the print files");
  }

  await appendOrderEvent(orderId, {
    kind: "print_files_rebuilt",
    title: "Print files rebuilt",
    detail: "We rebuilt your book's print files and are sending it to the printer again.",
    metadata: { replacedLuluPrintJobId: oldJobId, replacedLuluStatus: oldLuluStatus },
  });
  return submitOrderToLulu(orderId);
}


export async function listOrdersForUser(userId: string): Promise<ApiResult<BookOrderSummary[]>> {
  const { data, error } = await getSupabaseAdmin()
    .from("book_orders")
    .select(
      `
      id, user_id, product_id, project_title, page_count, status, fulfillment, payment_method,
      total_cents, shipping_level, lulu_status_name, tracking_number, tracking_urls,
      estimated_delivery_min, estimated_delivery_max, created_at, updated_at,
      lulu_production_due_at, refunded_cents,
      print_products ( name )
    `,
    )
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return { data: null, error: { message: error.message } };
  }

  return {
    data: (data as OrderRow[]).map(mapSummary),
    error: null,
  };
}

export async function getOrderForUser(
  userId: string,
  orderId: string,
  options?: { syncLulu?: boolean },
): Promise<ApiResult<BookOrderDetail>> {
  if (options?.syncLulu) {
    const sync = await syncOrderFromLulu(orderId, userId);
    if (sync.error) {
      /* still return cached order if sync fails */
    }
  }

  const { data, error } = await getSupabaseAdmin()
    .from("book_orders")
    .select(
      `
      id, user_id, product_id, project_title, page_count, status, fulfillment, payment_method,
      total_cents, shipping_level, lulu_status_name, lulu_status_message,
      lulu_print_job_id, tracking_number, tracking_urls, carrier,
      estimated_delivery_min, estimated_delivery_max, estimated_dispatch_min,
      estimated_dispatch_max, contact_email, shipping_address, billing_address, is_gift, gift_note, cover_pdf_path, paid_at,
      submitted_to_lulu_at, shipped_at, delivered_at, created_at, updated_at,
      lulu_production_due_at, refunded_cents, canceled_at, cancel_reason,
      print_products ( name )
    `,
    )
    .eq("id", orderId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    return { data: null, error: { message: error.message } };
  }
  if (!data) {
    return { data: null, error: { message: "Order not found", code: "NOT_FOUND" } };
  }

  const { data: events, error: eventsError } = await getSupabaseAdmin()
    .from("book_order_events")
    .select("id, kind, title, detail, occurred_at")
    .eq("order_id", orderId)
    .order("occurred_at", { ascending: false });

  if (eventsError) {
    return { data: null, error: { message: eventsError.message } };
  }

  return {
    data: mapDetail(data as OrderRow, (events ?? []) as EventRow[]),
    error: null,
  };
}

export async function syncOrderFromLulu(
  orderId: string,
  userId?: string,
): Promise<ApiResult<{ status: BookOrderStatus }>> {
  if (!luluConfigured()) {
    return { data: null, error: { message: "Lulu API is not configured" } };
  }

  let query = getSupabaseAdmin()
    .from("book_orders")
    .select("*")
    .eq("id", orderId);
  if (userId) query = query.eq("user_id", userId);
  const { data: order, error } = await query.maybeSingle();

  if (error) return { data: null, error: { message: error.message } };
  if (!order) return { data: null, error: { message: "Order not found", code: "NOT_FOUND" } };
  if (order.deleted_at) {
    return { data: { status: order.status as BookOrderStatus }, error: null };
  }
  if (!order.lulu_print_job_id) {
    return { data: { status: order.status as BookOrderStatus }, error: null };
  }

  try {
    const job = await fetchLuluPrintJob(order.lulu_print_job_id);
    const luluStatus = job.status?.name ?? null;
    const mapped = bookStatusFromLulu(luluStatus);
    const tracking = extractTrackingFromPrintJob(job);
    const changedAt = job.status?.changed ?? new Date().toISOString();

    const updates: Record<string, unknown> = {
      lulu_status_name: luluStatus,
      lulu_status_message: job.status?.message ?? null,
      lulu_status_changed_at: changedAt,
    };
    if (job.production_due_time) updates.lulu_production_due_at = job.production_due_time;

    // An order we canceled stays canceled whatever Lulu reports next.
    if (mapped && order.status !== "canceled") updates.status = mapped;
    if (tracking.trackingNumber) updates.tracking_number = tracking.trackingNumber;
    if (tracking.trackingUrls.length) updates.tracking_urls = tracking.trackingUrls;
    if (tracking.carrier) updates.carrier = tracking.carrier;

    if (mapped === "shipped" && !order.shipped_at) {
      updates.shipped_at = changedAt;
    }
    if (mapped === "delivered" && !order.delivered_at) {
      updates.delivered_at = changedAt;
    }

    const { error: updateError } = await getSupabaseAdmin()
      .from("book_orders")
      .update(updates)
      .eq("id", orderId);

    if (updateError) return { data: null, error: { message: updateError.message } };

    if (luluStatus && luluStatus !== order.lulu_status_name) {
      await appendOrderEvent(orderId, {
        kind: "lulu_status",
        title: statusLabel((mapped ?? order.status) as BookOrderStatus),
        detail: job.status?.message ?? `Printer status: ${luluStatus}`,
        metadata: { luluStatus },
      });
    }

    return { data: { status: (mapped ?? order.status) as BookOrderStatus }, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Lulu sync failed";
    return { data: null, error: { message } };
  }
}

export async function applyLuluWebhookPrintJob(
  printJobId: number,
): Promise<ApiResult<{ orderId: string }>> {
  const { data: order, error } = await getSupabaseAdmin()
    .from("book_orders")
    .select("id, deleted_at")
    .eq("lulu_print_job_id", printJobId)
    .maybeSingle();

  if (error) return { data: null, error: { message: error.message } };
  if (!order) {
    return { data: null, error: { message: "No order for print job", code: "NOT_FOUND" } };
  }
  if (order.deleted_at) {
    return { data: { orderId: order.id as string }, error: null };
  }

  const sync = await syncOrderFromLulu(order.id);
  if (sync.error) return sync as ApiResult<{ orderId: string }>;
  return { data: { orderId: order.id }, error: null };
}

/** Used when checkout flow creates an order (future Stripe/Lulu submit). */
export async function recordOrderPlacedEvent(orderId: string): Promise<void> {
  await appendOrderEvent(orderId, {
    kind: "order_placed",
    title: "Order placed",
    detail: "Your payment was confirmed.",
  });
}

type AdminOrderRow = OrderRow & {
  canceled_at: string | null;
  deleted_at: string | null;
  lulu_print_job_id: number | null;
};

function mapAdminOrder(row: AdminOrderRow): AdminUserOrderSummary {
  return {
    id: row.id,
    userId: row.user_id,
    projectTitle: row.project_title,
    productName: productName(row),
    pageCount: row.page_count,
    status: row.status,
    totalCents: row.total_cents,
    createdAt: row.created_at,
    canceledAt: row.canceled_at,
    deletedAt: row.deleted_at,
    luluPrintJobId: row.lulu_print_job_id,
    luluStatusName: row.lulu_status_name,
    fulfillment: row.fulfillment ?? "print",
    contactEmail: row.contact_email ?? null,
    cancelReason: row.cancel_reason ?? null,
    refundedCents: row.refunded_cents ?? null,
    luluProductionDueAt: row.lulu_production_due_at ?? null,
  };
}

const ADMIN_ORDER_COLUMNS = `
      id, user_id, project_title, page_count, status, total_cents, created_at, contact_email,
      canceled_at, cancel_reason, refunded_cents, deleted_at, lulu_print_job_id, lulu_status_name,
      lulu_production_due_at, fulfillment,
      print_products ( name )
    `;

export async function listOrdersForAdmin(
  userId: string,
  options?: { includeHidden?: boolean },
): Promise<ApiResult<AdminUserOrderSummary[]>> {
  let query = getSupabaseAdmin()
    .from("book_orders")
    .select(ADMIN_ORDER_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (!options?.includeHidden) {
    query = query.is("deleted_at", null);
  }

  const { data, error } = await query;
  if (error) return { data: null, error: { message: error.message } };

  return {
    data: (data as unknown as AdminOrderRow[]).map(mapAdminOrder),
    error: null,
  };
}

/** Every customer's orders, newest first, for the admin Orders page. Drafts and quotes are left out. */
export async function listAllOrdersForAdmin(options?: {
  status?: BookOrderStatus | "active";
  limit?: number;
}): Promise<ApiResult<AdminUserOrderSummary[]>> {
  let query = getSupabaseAdmin()
    .from("book_orders")
    .select(ADMIN_ORDER_COLUMNS)
    .is("deleted_at", null)
    .not("status", "in", "(draft,quoted)")
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(options?.limit ?? 200, 1), 500));
  if (options?.status === "active") {
    query = query.in("status", ["awaiting_payment", "paid", "submitting_to_lulu", "submitted_to_lulu", "in_production", "failed"]);
  } else if (options?.status) {
    query = query.eq("status", options.status);
  }

  const { data, error } = await query;
  if (error) return { data: null, error: { message: error.message } };
  const rows = (data as unknown as AdminOrderRow[]).map(mapAdminOrder);

  const emails = new Map<string, string | null>();
  await Promise.all(
    [...new Set(rows.map((r) => r.userId))].map(async (id) => {
      try {
        const { data: auth } = await getSupabaseAuth().auth.admin.getUserById(id);
        emails.set(id, auth.user?.email ?? null);
      } catch {
        emails.set(id, null);
      }
    }),
  );
  return { data: rows.map((r) => ({ ...r, userEmail: emails.get(r.userId) ?? null })), error: null };
}

export type CancelOrderResult = { status: BookOrderStatus; refundedCents: number };

/**
 * Cancels a print order while Lulu still allows it (its production delay hasn't run out), cancels
 * the Lulu print job, and puts what the order charged back in the customer's wallet.
 *
 * Order of operations: Lulu first (the step that can be refused), then one database transaction
 * that marks the order canceled and refunds. If the database step fails after Lulu canceled, a
 * retry finishes it: the RPC refunds an already-canceled order that wasn't refunded yet.
 */
export async function cancelBookOrder(input: {
  orderId: string;
  /** Scope to the customer's own order. Omit for admins. */
  userId?: string;
  actor: { kind: "customer" | "admin"; id: string };
  reason?: string | null;
}): Promise<ApiResult<CancelOrderResult>> {
  const db = getSupabaseAdmin();
  let query = db.from("book_orders").select("*").eq("id", input.orderId);
  if (input.userId) query = query.eq("user_id", input.userId);
  const { data: order, error } = await query.maybeSingle();

  if (error) return { data: null, error: { message: error.message } };
  if (!order || (order.deleted_at && input.actor.kind === "customer")) {
    return { data: null, error: { message: "Order not found", code: "NOT_FOUND" } };
  }

  const reason = (input.reason ?? "").trim().slice(0, 1000) || null;
  const status = order.status as BookOrderStatus;
  const isAdmin = input.actor.kind === "admin";
  const alreadyCanceled = status === "canceled";
  const notCancelable = (message: string) => ({
    data: null,
    error: { message, code: "NOT_CANCELABLE" },
  });

  if (alreadyCanceled && (order.refunded_at || !order.paid_at || !order.credits_applied)) {
    return { data: { status: "canceled", refundedCents: 0 }, error: null };
  }
  if (!alreadyCanceled) {
    if (status === "submitting_to_lulu") {
      return notCancelable("Your book is being sent to the printer right now. Try again in a minute.");
    }
    if (!isAdmin && (order.fulfillment ?? "print") === "digital") {
      return notCancelable("Print-at-home books are delivered right away, so they can't be canceled.");
    }
    const allowed = isAdmin ? ADMIN_CANCELABLE_STATUSES : CUSTOMER_CANCELABLE_STATUSES;
    if (!allowed.includes(status)) {
      return notCancelable(
        status === "in_production" || status === "shipped" || status === "delivered"
          ? "This book has already gone into production, so it can no longer be canceled."
          : `An order that is ${statusLabel(status).toLowerCase()} can't be canceled.`,
      );
    }
  }

  const jobId = order.lulu_print_job_id as number | null;
  const luluStatus = ((order.lulu_status_name as string | null) ?? "").toUpperCase();
  let canceledAtLulu = false;
  if (!alreadyCanceled && jobId && !DEAD_LULU_STATUSES.includes(luluStatus)) {
    if (!luluConfigured()) return { data: null, error: { message: "Lulu API is not configured" } };
    try {
      const job = await fetchLuluPrintJob(jobId);
      const live = (job.status?.name ?? "").toUpperCase();
      if (!DEAD_LULU_STATUSES.includes(live)) {
        if (job.is_cancellable === false) {
          await syncOrderFromLulu(input.orderId);
          return notCancelable(
            "This book has already gone into production at the printer, so it can no longer be canceled.",
          );
        }
        await cancelLuluPrintJob(jobId);
        canceledAtLulu = true;
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Lulu cancel failed";
      console.error(`[orders] cancel ${input.orderId}: Lulu job ${jobId}: ${message}`);
      return {
        data: null,
        error: { message: "The printer wouldn't cancel this book. It may already be in production." },
      };
    }
  }

  const { data: rpc, error: rpcError } = await db.rpc("cancel_and_refund_book_order", {
    p_order_id: input.orderId,
    p_canceled_by: input.actor.id,
    p_reason: reason ?? "",
    p_allowed_statuses: isAdmin ? ADMIN_CANCELABLE_STATUSES : CUSTOMER_CANCELABLE_STATUSES,
  });
  if (rpcError) {
    console.error(
      `[orders] cancel ${input.orderId}: refund step failed${canceledAtLulu ? " after Lulu canceled the job" : ""}: ${rpcError.message}`,
    );
    return {
      data: null,
      error: {
        message: canceledAtLulu
          ? "The printer canceled your book, but your refund didn't go through. Try again, or contact us."
          : rpcError.message,
      },
    };
  }
  const refundedCents = Number((rpc as { refundedCents?: number } | null)?.refundedCents ?? 0);

  if (jobId) {
    await db
      .from("book_orders")
      .update({
        lulu_status_name: "CANCELED",
        lulu_status_message: isAdmin ? "Canceled by admin" : "Canceled by customer",
        lulu_status_changed_at: new Date().toISOString(),
      })
      .eq("id", input.orderId);
  }

  if (!alreadyCanceled) {
    const who = isAdmin ? "Canceled by Colorful Memories." : "You canceled this order.";
    const refund = refundedCents > 0 ? ` ${usdCents(refundedCents)} was returned to your wallet.` : "";
    await appendOrderEvent(input.orderId, {
      kind: isAdmin ? "admin_cancel" : "customer_cancel",
      title: "Order canceled",
      detail: `${who}${refund}`,
      metadata: { actorId: input.actor.id, reason, refundedCents, luluPrintJobId: jobId },
    });
    await recordActivity({
      userId: order.user_id as string,
      category: "orders",
      type: "order_canceled",
      description: `Order for ${quoted(order.project_title as string | null, "a printed book")} was canceled`,
      referenceType: "book_order",
      referenceId: input.orderId,
    });
  } else if (refundedCents > 0) {
    await appendOrderEvent(input.orderId, {
      kind: "order_refund",
      title: "Refunded",
      detail: `${usdCents(refundedCents)} was returned to your wallet.`,
      metadata: { actorId: input.actor.id, refundedCents },
    });
  }

  return { data: { status: "canceled", refundedCents }, error: null };
}

function usdCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export async function cancelOrderAsAdmin(input: {
  userId: string;
  orderId: string;
  adminId: string;
  reason?: string | null;
}): Promise<ApiResult<CancelOrderResult>> {
  return cancelBookOrder({
    orderId: input.orderId,
    userId: input.userId,
    actor: { kind: "admin", id: input.adminId },
    reason: input.reason,
  });
}

export async function softDeleteOrderAsAdmin(input: {
  userId: string;
  orderId: string;
  adminId: string;
}): Promise<ApiResult<{ success: boolean }>> {
  const { data: order, error } = await getSupabaseAdmin()
    .from("book_orders")
    .select("*")
    .eq("id", input.orderId)
    .eq("user_id", input.userId)
    .maybeSingle();

  if (error) return { data: null, error: { message: error.message } };
  if (!order) return { data: null, error: { message: "Order not found", code: "NOT_FOUND" } };
  if (order.deleted_at) {
    return { data: { success: true }, error: null };
  }

  if (order.status !== "canceled" && !order.canceled_at) {
    await cancelOrderAsAdmin(input);
  }

  const now = new Date().toISOString();
  const { error: updateError } = await getSupabaseAdmin()
    .from("book_orders")
    .update({
      deleted_at: now,
      deleted_by: input.adminId,
      quote_expires_at: null,
    })
    .eq("id", input.orderId);

  if (updateError) return { data: null, error: { message: updateError.message } };

  await appendOrderEvent(input.orderId, {
    kind: "admin_hide",
    title: "Order hidden",
    detail: "Removed from view; fulfillment sync and estimates stopped.",
    metadata: { adminId: input.adminId },
  });

  return { data: { success: true }, error: null };
}

/** A print order's print-ready file, for the customer who owns it. */
export async function getPrintOrderFilePath(
  userId: string,
  orderId: string,
  file: "interior" | "cover",
): Promise<ApiResult<{ path: string; title: string }>> {
  const { data, error } = await getSupabaseAdmin()
    .from("book_orders")
    .select("project_title, fulfillment, interior_pdf_path, cover_pdf_path")
    .eq("id", orderId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { data: null, error: { message: error.message } };
  const path = (file === "cover" ? data?.cover_pdf_path : data?.interior_pdf_path) as string | null | undefined;
  if (!data || data.fulfillment === "digital" || !path) {
    return { data: null, error: { message: "Print file not found", code: "NOT_FOUND" } };
  }
  const title = (data.project_title as string | null)?.trim() || "coloring-book";
  return { data: { path, title: `${title} ${file}` }, error: null };
}

/** Signed upload for the front cover image; only while the order is still a draft. */
export async function createDraftCoverUpload(userId: string, orderId: string): Promise<ApiResult<SignedUpload>> {
  const owned = await getOwnedDraftOrder(userId, orderId);
  if (owned.error) return { data: null, error: owned.error };
  try {
    return { data: await createCoverFrontUpload(userId, orderId), error: null };
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Could not start the cover upload." } };
  }
}

/** Safety net for missed Lulu webhooks: refresh every order Lulu may still be changing. */
export async function syncActiveLuluOrders(): Promise<{ checked: number; failed: number }> {
  const { data, error } = await getSupabaseAdmin()
    .from("book_orders")
    .select("id")
    .in("status", ["submitted_to_lulu", "in_production", "shipped"])
    .not("lulu_print_job_id", "is", null)
    .is("deleted_at", null)
    .limit(200);
  if (error) {
    console.error(`[lulu-sync] list failed: ${error.message}`);
    return { checked: 0, failed: 0 };
  }
  let failed = 0;
  for (const row of data ?? []) {
    const r = await syncOrderFromLulu(row.id as string);
    if (r.error) {
      failed += 1;
      console.error(`[lulu-sync] ${row.id}: ${r.error.message}`);
    }
  }
  return { checked: data?.length ?? 0, failed };
}
