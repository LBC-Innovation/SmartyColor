import { NextResponse } from "next/server";
import { getPublicPriceList } from "@/server/pricingService";

export const dynamic = "force-dynamic";

/** What each action costs the customer, for showing prices. Charges read the catalog themselves. */
export async function GET() {
  const result = await getPublicPriceList();
  return NextResponse.json(result, {
    status: result.error ? 500 : 200,
    headers: { "Cache-Control": result.error ? "no-store" : "public, max-age=30" },
  });
}
