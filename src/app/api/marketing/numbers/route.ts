import { getMarketingNumbers } from "@/server/marketing/marketingNumbers";

/** Numbers for public copy: the reference book price and the sign-up credit. Null when unknown or off. */
export async function GET() {
  const numbers = await getMarketingNumbers();
  return Response.json(
    { data: numbers, error: null },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" } },
  );
}
