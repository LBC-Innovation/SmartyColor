import { redirect } from "next/navigation";
import { CHECKOUT_SESSION_PARAM, CREDITS_RETURN_PARAM } from "@/lib/credits/types";

export const dynamic = "force-dynamic";

/**
 * The book is now made and bought on /studio itself. Old links (saved carts, "Continue your book",
 * a Stripe return started before this change) still land in the right place: the studio opens the
 * saved book from `cart` and picks up `step` and the credit-return parameters.
 */
const KEPT_PARAMS = ["cart", "step", "project", CREDITS_RETURN_PARAM, CHECKOUT_SESSION_PARAM] as const;

export default async function BookOrderRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const kept = new URLSearchParams();
  for (const key of KEPT_PARAMS) {
    const value = params[key];
    if (typeof value === "string" && value) kept.set(key, value);
  }
  if (!kept.has("cart") && !kept.has("step")) kept.set("book", "open");
  const query = kept.toString();
  redirect(query ? `/studio?${query}` : "/studio");
}
