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
  BookPaymentMethod,
  ShippingAddress,
} from "@/lib/orders/types";
import { isShippingAddressComplete, normalizeShippingAddress } from "@/lib/orders/shippingAddress";
import { getSupabaseAdmin } from "@/lib/supabase/service";
import { quoted, recordActivity } from "@/server/activityService";
import { luluConfigured } from "@/server/lulu/config";
import type { AdminUserOrderSummary } from "@/lib/orders/adminTypes";
import {
  cancelLuluPrintJob,
  extractTrackingFromPrintJob,
  fetchLuluPrintJob,
} from "@/server/lulu/printJobs";

type OrderRow = {
  id: string;
  user_id: string;
  product_id: string;
  project_title: string | null;
  page_count: number;
  status: BookOrderStatus;
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
  paid_at: string | null;
  submitted_to_lulu_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
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
    productName: productName(row),
    pageCount: row.page_count,
    status: row.status,
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
    carrier: row.carrier,
    estimatedDispatchMin: row.estimated_dispatch_min,
    estimatedDispatchMax: row.estimated_dispatch_max,
    paidAt: row.paid_at,
    submittedToLuluAt: row.submitted_to_lulu_at,
    shippedAt: row.shipped_at,
    deliveredAt: row.delivered_at,
    luluStatusMessage: row.lulu_status_message,
    luluPrintJobId: row.lulu_print_job_id,
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

export async function createDraftBookOrder(input: {
  userId: string;
  contactEmail: string;
  productId: string;
  pageCount: number;
  projectTitle: string;
  luluCostCents: number | null;
  totalCents: number | null;
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
      lulu_cost_cents: input.luluCostCents,
      total_cents: input.totalCents,
      shipping_address: input.shippingAddress
        ? normalizeShippingAddress(input.shippingAddress)
        : shippingAddressFromQuotePostcode(input.shippingPostcode),
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

export async function updateDraftBookOrder(input: {
  userId: string;
  orderId: string;
  productId: string;
  pageCount: number;
  projectTitle: string;
  luluCostCents: number | null;
  totalCents: number | null;
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
      lulu_cost_cents: input.luluCostCents,
      total_cents: input.totalCents,
      shipping_address: mergedAddress,
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
    .select("id, user_id, status")
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

  const { error } = await getSupabaseAdmin()
    .from("book_orders")
    .update({
      shipping_address: normalizeShippingAddress(input.shippingAddress),
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

  const { error } = await getSupabaseAdmin()
    .from("book_orders")
    .update({
      status: "awaiting_payment",
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

const TERMINAL_STATUSES: BookOrderStatus[] = [
  "shipped",
  "delivered",
  "canceled",
  "refunded",
];

export async function listOrdersForUser(userId: string): Promise<ApiResult<BookOrderSummary[]>> {
  const { data, error } = await getSupabaseAdmin()
    .from("book_orders")
    .select(
      `
      id, user_id, product_id, project_title, page_count, status, payment_method,
      total_cents, shipping_level, lulu_status_name, tracking_number, tracking_urls,
      estimated_delivery_min, estimated_delivery_max, created_at, updated_at,
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
      id, user_id, product_id, project_title, page_count, status, payment_method,
      total_cents, shipping_level, lulu_status_name, lulu_status_message,
      lulu_print_job_id, tracking_number, tracking_urls, carrier,
      estimated_delivery_min, estimated_delivery_max, estimated_dispatch_min,
      estimated_dispatch_max, contact_email, shipping_address, paid_at,
      submitted_to_lulu_at, shipped_at, delivered_at, created_at, updated_at,
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

    if (mapped) updates.status = mapped;
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
    projectTitle: row.project_title,
    productName: productName(row),
    pageCount: row.page_count,
    status: row.status,
    totalCents: row.total_cents,
    createdAt: row.created_at,
    canceledAt: row.canceled_at,
    deletedAt: row.deleted_at,
    luluPrintJobId: row.lulu_print_job_id,
  };
}

export async function listOrdersForAdmin(
  userId: string,
  options?: { includeHidden?: boolean },
): Promise<ApiResult<AdminUserOrderSummary[]>> {
  let query = getSupabaseAdmin()
    .from("book_orders")
    .select(
      `
      id, project_title, page_count, status, total_cents, created_at,
      canceled_at, deleted_at, lulu_print_job_id,
      print_products ( name )
    `,
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (!options?.includeHidden) {
    query = query.is("deleted_at", null);
  }

  const { data, error } = await query;
  if (error) return { data: null, error: { message: error.message } };

  return {
    data: (data as AdminOrderRow[]).map(mapAdminOrder),
    error: null,
  };
}

export async function cancelOrderAsAdmin(input: {
  userId: string;
  orderId: string;
  adminId: string;
}): Promise<ApiResult<{ status: BookOrderStatus }>> {
  const { data: order, error } = await getSupabaseAdmin()
    .from("book_orders")
    .select("*")
    .eq("id", input.orderId)
    .eq("user_id", input.userId)
    .maybeSingle();

  if (error) return { data: null, error: { message: error.message } };
  if (!order) return { data: null, error: { message: "Order not found", code: "NOT_FOUND" } };
  if (order.deleted_at) {
    return { data: null, error: { message: "Order is hidden" } };
  }
  if (order.status === "canceled" || order.canceled_at) {
    return { data: { status: "canceled" }, error: null };
  }
  if (TERMINAL_STATUSES.includes(order.status as BookOrderStatus)) {
    return {
      data: null,
      error: { message: `Cannot cancel an order with status “${order.status}”` },
    };
  }

  if (order.lulu_print_job_id && luluConfigured()) {
    try {
      await cancelLuluPrintJob(order.lulu_print_job_id);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Lulu cancel failed";
      return { data: null, error: { message } };
    }
  }

  const now = new Date().toISOString();
  const { error: updateError } = await getSupabaseAdmin()
    .from("book_orders")
    .update({
      status: "canceled",
      canceled_at: now,
      canceled_by: input.adminId,
      lulu_status_name: "CANCELED",
      lulu_status_message: "Canceled by admin",
    })
    .eq("id", input.orderId);

  if (updateError) return { data: null, error: { message: updateError.message } };

  await appendOrderEvent(input.orderId, {
    kind: "admin_cancel",
    title: "Order canceled",
    detail: "Canceled by an administrator.",
    metadata: { adminId: input.adminId },
  });
  await recordActivity({
    userId: input.userId,
    category: "orders",
    type: "order_canceled",
    description: `Order for ${quoted(order.project_title as string | null, "a printed book")} was canceled`,
    referenceType: "book_order",
    referenceId: input.orderId,
  });

  return { data: { status: "canceled" }, error: null };
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
