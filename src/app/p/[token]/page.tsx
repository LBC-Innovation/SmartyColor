import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SharedPagePrintButton } from "@/components/v2/share/SharedPagePrintButton";
import { findSharedPage } from "@/server/pageSharesService";

type Props = { params: Promise<{ token: string }> };

/** Where "Make your own" goes: the landing page, tagged so sign-ups from shared pages can be counted. */
const MAKE_YOUR_OWN_HREF = "/?utm_source=share&utm_medium=page_link&utm_campaign=shared_page";

// Revoking a link must take effect on the next request.
export const dynamic = "force-dynamic";

const TITLE = "A coloring page made from a family photo";
const DESCRIPTION = "Someone made this coloring page with Colorful Memories. Print it and color it in.";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const page = await findSharedPage(token).catch(() => null);
  const robots = { index: false, follow: false, googleBot: { index: false, follow: false, noimageindex: true } };
  if (!page) return { title: "Page not available | Colorful Memories", robots };
  const image = `/p/${token}/image`;
  return {
    title: `${TITLE} | Colorful Memories`,
    description: DESCRIPTION,
    robots,
    openGraph: { title: TITLE, description: DESCRIPTION, images: [{ url: image }] },
    twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [image] },
  };
}

/**
 * A shared coloring page: the page itself, a way to print it, and an invitation to make your
 * own. Nothing else from the album (photo, caption, names) is ever read for this page.
 */
export default async function SharedPage({ params }: Props) {
  const { token } = await params;
  const page = await findSharedPage(token).catch(() => null);
  if (!page) notFound();

  return (
    <main className="px-4 py-6 sm:py-10">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-5">
        <Link href={MAKE_YOUR_OWN_HREF} className="print:hidden" aria-label="Colorful Memories">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/wordmark.svg" alt="Colorful Memories" width={220} height={27} className="h-6 w-auto" />
        </Link>

        <div className="w-full rounded-2xl border border-gray-200 bg-white p-3 shadow-sm print:border-0 print:p-0 print:shadow-none sm:p-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/p/${token}/image`}
            alt="Coloring page"
            className="mx-auto h-auto max-h-[75dvh] w-full object-contain print:max-h-none"
          />
        </div>

        <div className="flex w-full flex-col items-center gap-3 text-center print:hidden">
          <SharedPagePrintButton />
          <section className="v2-panel mt-2 w-full p-5">
            <h1 className="text-lg font-semibold text-v2-ink">Coloring pages from your own photos</h1>
            <p className="mt-1 text-sm leading-relaxed text-v2-muted">
              This page started as a family photo. Turn yours into pages your kids will recognize, then
              print them at home or order a book.
            </p>
            <Link href={MAKE_YOUR_OWN_HREF} className="v2-btn-primary mt-4 inline-flex">
              Make your own from your photos
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}
