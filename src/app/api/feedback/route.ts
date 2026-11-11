import { jsonError, jsonResult } from "@/lib/api/respond";
import { verifyToken } from "@/server/email/signedLinks";
import { submitTestimonial } from "@/server/testimonials/testimonialsService";

export const runtime = "nodejs";

/** POST ?t=<token> (multipart): the form from the "How did it go?" email. No sign-in needed. */
export async function POST(request: Request) {
  const orderId = verifyToken("feedback", new URL(request.url).searchParams.get("t"));
  if (!orderId) return jsonError("This link is not valid.", 400);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("Invalid form", 400);
  }
  const photo = form.get("photo");
  const result = await submitTestimonial({
    orderId,
    quote: String(form.get("quote") ?? ""),
    firstName: String(form.get("firstName") ?? ""),
    relation: String(form.get("relation") ?? ""),
    consent: form.get("consent") === "on" || form.get("consent") === "true",
    photo: photo instanceof File ? photo : null,
  });
  const code = result.error?.code;
  if (code === "NOT_FOUND") return jsonError(result.error!.message, 404, code);
  if (code === "INVALID" || code === "ALREADY_SENT") return jsonError(result.error!.message, 400, code);
  return jsonResult(result, result.error ? 500 : 201);
}
