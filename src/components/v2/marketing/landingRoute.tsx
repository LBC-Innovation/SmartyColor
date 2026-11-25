import type { Metadata } from "next";
import { preload } from "react-dom";
import { LANDING_PAGES, type LandingIntent } from "@/content/marketing";
import { holidayOrderBy } from "@/lib/marketing/holiday";
import { getMarketingNumbers } from "@/server/marketing/marketingNumbers";
import { HERO_PHOTO_SIZES, heroImage } from "@/lib/marketing/heroImage";
import { V2LandingPage } from "@/components/v2/marketing/V2LandingPage";
import { isBookFirst, landingFaq, landingValues } from "@/lib/marketing/landingValues";

/** Title, description, canonical URL and share image for one landing page. */
export function landingMetadata(intent: LandingIntent): Metadata {
  const page = LANDING_PAGES[intent];
  const images = [{ url: page.shareImage, width: 1200, height: 630, alt: page.shareImageAlt }];
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: page.path },
    // A page without its real photo yet is reachable but kept out of search (see LandingPageCopy.ready).
    ...(page.ready ? {} : { robots: { index: false, follow: true } }),
    openGraph: {
      type: "website",
      url: page.path,
      siteName: "Colorful Memories",
      title: page.title,
      description: page.description,
      images,
    },
    twitter: { card: "summary_large_image", title: page.title, description: page.description, images },
  };
}

/** Server half of a landing page: real prices and dates, the hero photo preload, then the page itself. */
export async function LandingRoute({ intent }: { intent: LandingIntent }) {
  const hero = heroImage(LANDING_PAGES[intent]);
  preload(hero.src, { as: "image", fetchPriority: "high", imageSrcSet: hero.srcSet, imageSizes: HERO_PHOTO_SIZES });
  const numbers = await getMarketingNumbers();
  const holiday = holidayOrderBy();
  const faq = landingFaq(intent, landingValues(numbers, holiday?.label ?? null), isBookFirst(intent, numbers));
  return (
    <>
      <V2LandingPage intent={intent} numbers={numbers} holiday={holiday} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faq.map(({ q, a }) => ({
              "@type": "Question",
              name: q,
              acceptedAnswer: { "@type": "Answer", text: a },
            })),
          }),
        }}
      />
    </>
  );
}
