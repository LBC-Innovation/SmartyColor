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
import { getSupabaseAdmin } from "@/lib/supabase/service";
import { luluConfigured } from "@/server/lulu/config";
import {
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
    .select("id")
    .eq("lulu_print_job_id", printJobId)
    .maybeSingle();

  if (error) return { data: null, error: { message: error.message } };
  if (!order) {
    return { data: null, error: { message: "No order for print job", code: "NOT_FOUND" } };
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
