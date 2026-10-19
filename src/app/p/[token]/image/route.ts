import { loadSharedPageImage } from "@/server/pageSharesService";

type Params = { params: Promise<{ token: string }> };

/**
 * The shared coloring page's picture. Served through here rather than a signed storage URL so
 * that revoking the link stops the image at once, and nothing about where it's stored leaks.
 */
export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  const image = await loadSharedPageImage(token).catch(() => null);
  if (!image) {
    return new Response("Not found", {
      status: 404,
      headers: { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" },
    });
  }
  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "Content-Type": image.mime,
      "X-Robots-Tag": "noindex, nofollow, noimageindex",
      // Revoking must work immediately, so no shared cache may keep a copy.
      "Cache-Control": "private, no-store",
    },
  });
}
