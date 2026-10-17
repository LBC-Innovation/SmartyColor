import "server-only";
import { randomUUID } from "node:crypto";
import type { ApiResult } from "@/lib/api/types";
import { getSupabaseAdmin } from "@/lib/supabase/service";
import { extensionForMime, putObject, signedReadUrls } from "@/server/storage/libraryFiles";

/**
 * Stories sent back from the "How did it go?" email. Nothing here reaches the site by itself:
 * an admin approves an entry and copies the generated snippet into src/content/testimonials.ts.
 */

export const QUOTE_MAX = 200;
export const NAME_MAX = 40;
export const RELATION_MAX = 40;
export const PHOTO_MAX_BYTES = 4 * 1024 * 1024;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export type FeedbackOrder = { orderId: string; userId: string; title: string | null; alreadySent: boolean };

export type TestimonialSubmission = {
  id: string;
  orderId: string | null;
  quote: string;
  firstName: string;
  relation: string;
  photoUrl: string | null;
  consent: boolean;
  consentAt: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

const err = (message: string, code?: string): ApiResult<never> => ({ data: null, error: { message, ...(code ? { code } : {}) } });

function db() {
  return getSupabaseAdmin();
}

export async function getFeedbackOrder(orderId: string): Promise<ApiResult<FeedbackOrder>> {
  const { data, error } = await db()
    .from("book_orders")
    .select("id, user_id, project_title, deleted_at")
    .eq("id", orderId)
    .maybeSingle();
  if (error) return err(error.message);
  if (!data || data.deleted_at) return err("Order not found", "NOT_FOUND");
  const { count } = await db()
    .from("testimonial_submissions")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId);
  return {
    data: { orderId: data.id as string, userId: data.user_id as string, title: data.project_title as string | null, alreadySent: (count ?? 0) > 0 },
    error: null,
  };
}

export async function submitTestimonial(input: {
  orderId: string;
  quote: string;
  firstName: string;
  relation: string;
  consent: boolean;
  photo: File | null;
}): Promise<ApiResult<{ id: string }>> {
  const order = await getFeedbackOrder(input.orderId);
  if (order.error) return order;
  if (order.data.alreadySent) return err("We already have your story for this book. Thank you!", "ALREADY_SENT");

  const quote = input.quote.replace(/\s+/g, " ").trim();
  const firstName = input.firstName.replace(/\s+/g, " ").trim();
  const relation = input.relation.replace(/\s+/g, " ").trim();
  if (!quote) return err("Please write a line about how it went.", "INVALID");
  if (quote.length > QUOTE_MAX) return err(`Please keep it under ${QUOTE_MAX} characters.`, "INVALID");
  if (!firstName || firstName.length > NAME_MAX) return err("Please add your first name.", "INVALID");
  if (relation.length > RELATION_MAX) return err(`Please keep that under ${RELATION_MAX} characters.`, "INVALID");

  const id = randomUUID();
  let photoPath: string | null = null;
  if (input.photo && input.photo.size > 0) {
    if (!PHOTO_TYPES.has(input.photo.type)) return err("Please send a JPEG, PNG or WebP photo.", "INVALID");
    if (input.photo.size > PHOTO_MAX_BYTES) return err("That photo is too large.", "INVALID");
    photoPath = `testimonials/${order.data.userId}/${id}.${extensionForMime(input.photo.type)}`;
    try {
      await putObject(photoPath, Buffer.from(await input.photo.arrayBuffer()), input.photo.type);
    } catch (e) {
      return err(e instanceof Error ? e.message : "Photo upload failed");
    }
  }

  const now = new Date().toISOString();
  const { error } = await db().from("testimonial_submissions").insert({
    id,
    user_id: order.data.userId,
    order_id: input.orderId,
    quote,
    first_name: firstName,
    relation,
    photo_path: photoPath,
    consent: input.consent,
    consent_at: input.consent ? now : null,
  });
  if (error) return err(error.message);
  return { data: { id }, error: null };
}

export async function listTestimonialSubmissions(): Promise<ApiResult<TestimonialSubmission[]>> {
  const { data, error } = await db()
    .from("testimonial_submissions")
    .select("id, order_id, quote, first_name, relation, photo_path, consent, consent_at, status, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return err(error.message);
  const paths = (data ?? []).map((r) => r.photo_path as string | null).filter((p): p is string => Boolean(p));
  let urls = new Map<string, string>();
  try {
    urls = await signedReadUrls(paths);
  } catch {
    // Rows still list without their photos.
  }
  return {
    data: (data ?? []).map((r) => ({
      id: r.id as string,
      orderId: r.order_id as string | null,
      quote: r.quote as string,
      firstName: r.first_name as string,
      relation: r.relation as string,
      photoUrl: r.photo_path ? (urls.get(r.photo_path as string) ?? null) : null,
      consent: r.consent as boolean,
      consentAt: r.consent_at as string | null,
      status: r.status as TestimonialSubmission["status"],
      createdAt: r.created_at as string,
    })),
    error: null,
  };
}

export async function reviewTestimonial(input: {
  id: string;
  status: "approved" | "rejected" | "pending";
  reviewerId: string;
}): Promise<ApiResult<{ id: string }>> {
  if (input.status === "approved") {
    const { data } = await db().from("testimonial_submissions").select("consent").eq("id", input.id).maybeSingle();
    if (!data) return err("Not found", "NOT_FOUND");
    if (!data.consent) return err("This customer did not give permission to use it on the site.", "NO_CONSENT");
  }
  const { data, error } = await db()
    .from("testimonial_submissions")
    .update({ status: input.status, reviewed_at: new Date().toISOString(), reviewed_by: input.reviewerId })
    .eq("id", input.id)
    .select("id")
    .maybeSingle();
  if (error) return err(error.message);
  if (!data) return err("Not found", "NOT_FOUND");
  return { data: { id: input.id }, error: null };
}
