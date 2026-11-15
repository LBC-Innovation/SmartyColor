import { LIFESTYLE_PHOTOS, type LandingPageCopy } from "@/content/marketing";
import { marketingSrcSet } from "@/lib/marketing/images";

/** Displayed width of the full-width hero photo (it fills the right of the hero on desktop). */
export const HERO_PHOTO_SIZES = "(min-width: 1024px) 72vw, 100vw";

export type HeroImage = { src: string; srcSet: string | undefined; width: number; height: number; alt: string };

/** The photo behind a landing page's hero: its lifestyle photo once ready, otherwise its real example photo. */
export function heroImage(page: LandingPageCopy): HeroImage {
  const photo = LIFESTYLE_PHOTOS[page.heroPhoto];
  if (photo.ready) {
    return {
      src: photo.src,
      srcSet: marketingSrcSet(photo.src, photo.srcSetWidths, photo.width),
      width: photo.width,
      height: photo.height,
      alt: photo.alt,
    };
  }
  const { photoSrc, srcSetWidths, width, height, photoAlt } = page.hero;
  return { src: photoSrc, srcSet: marketingSrcSet(photoSrc, srcSetWidths, width), width, height, alt: photoAlt };
}
