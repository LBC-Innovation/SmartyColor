import { optOutOfMarketingEmails } from "@/server/marketing/lifecycleEmailService";
import { verifyUnsubscribe } from "@/server/marketing/unsubscribe";

export const dynamic = "force-dynamic";

/**
 * Unsubscribe from reminder and review-request emails. Mail apps POST here directly (RFC 8058
 * one-click, from the List-Unsubscribe header); the /unsubscribe page's button posts a form.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  let userId = url.searchParams.get("u") ?? "";
  let token = url.searchParams.get("t") ?? "";
  const fromForm = (request.headers.get("content-type") ?? "").includes("application/x-www-form-urlencoded");
  if (fromForm) {
    const form = await request.formData().catch(() => null);
    userId = String(form?.get("u") ?? userId);
    token = String(form?.get("t") ?? token);
  }
  if (!verifyUnsubscribe(userId, token)) {
    return fromForm ? Response.redirect(new URL("/unsubscribe?error=1", url.origin), 303) : new Response("Invalid link", { status: 400 });
  }
  const ok = await optOutOfMarketingEmails(userId);
  if (fromForm) return Response.redirect(new URL(ok ? "/unsubscribe?done=1" : "/unsubscribe?error=1", url.origin), 303);
  return new Response(ok ? "Unsubscribed" : "Try again later", { status: ok ? 200 : 500 });
}
