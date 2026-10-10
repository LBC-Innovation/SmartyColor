import { redirect } from "next/navigation";

/** Vision costs moved under the admin area. */
export default function V2VisionCostsPage() {
  redirect("/admin/vision-costs");
}
