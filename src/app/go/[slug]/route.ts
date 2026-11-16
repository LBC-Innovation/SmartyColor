import { SITE_URL } from "@/lib/siteUrl";
import { getSupabaseAdmin } from "@/lib/supabase/service";

type Params = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

const SLUG = /^[a-z0-9][a-z0-9-]{1,47}$/;

type LinkRow = {
  destination: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string | null;
};

/**
 * A short campaign link (/go/<slug>, admin Campaign links): counts the click and redirects to its
 * page with the UTM tags, where the browser records them like any other tagged visit. Ad click ids
 * on the short link (a gclid or fbclid added by the ad platform) are passed through. Unknown or
 * archived links go to the homepage.
 */
export async function GET(request: Request, { params }: Params) {
  const { slug } = await params;
  const incoming = new URL(request.url);
  const base = process.env.NODE_ENV === "production" ? SITE_URL : incoming.origin;
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

  let row: LinkRow | null = null;
  if (SLUG.test(slug.toLowerCase())) {
    try {
      const { data } = await getSupabaseAdmin().rpc("follow_marketing_link", { p_slug: slug.toLowerCase() });
      row = (Array.isArray(data) ? data[0] : data) ?? null;
    } catch {
      row = null;
    }
  }
  if (!row) return Response.redirect(new URL("/", base), 302);

  const target = new URL(row.destination, base);
  // The link's tags win over anything already on the destination.
  target.searchParams.set("utm_source", row.utm_source);
  target.searchParams.set("utm_medium", row.utm_medium);
  target.searchParams.set("utm_campaign", row.utm_campaign);
  if (row.utm_content) target.searchParams.set("utm_content", row.utm_content);
  for (const [k, v] of incoming.searchParams) {
    if (!target.searchParams.has(k) && /^(gclid|gbraid|wbraid|fbclid|ttclid|msclkid|epik|li_fat_id|twclid|sccid|ref)$/.test(k)) {
      target.searchParams.set(k, v.slice(0, 200));
    }
  }
  return new Response(null, { status: 302, headers: { ...headers, Location: target.toString() } });
}
