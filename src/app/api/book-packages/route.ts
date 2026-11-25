import { jsonResult } from "@/lib/api/respond";
import { authenticateBearer } from "@/lib/auth/authenticate";
import type { BookPackageList } from "@/lib/bookPackages/types";
import { getSupabaseAdmin } from "@/lib/supabase/service";
import { listBuyablePackages } from "@/server/bookPackagesService";

export const dynamic = "force-dynamic";

/**
 * The packages that can be bought now (active and priced), with the prices the server will charge.
 * Open to guests, who see the tiles before they sign up; the wallet balance is added when signed in.
 */
export async function GET(request: Request) {
  const packages = await listBuyablePackages();
  if (packages.error) return jsonResult(packages, 500);

  let creditsBalanceCents: number | null = null;
  const header = request.headers.get("authorization");
  if (header) {
    const auth = await authenticateBearer(header);
    if (!("error" in auth)) {
      const { data } = await getSupabaseAdmin()
        .from("profiles")
        .select("credits_balance")
        .eq("id", auth.user.id)
        .maybeSingle();
      creditsBalanceCents = typeof data?.credits_balance === "number" ? data.credits_balance : null;
    }
  }
  const body: BookPackageList = { packages: packages.data!, creditsBalanceCents };
  return jsonResult({ data: body, error: null });
}
