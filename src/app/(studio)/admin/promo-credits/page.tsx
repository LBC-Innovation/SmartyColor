import { redirect } from "next/navigation";

/** Promo credits now live on the pricing page. */
export default function AdminPromoCreditsPage() {
  redirect("/admin/pricing#promotions");
}
