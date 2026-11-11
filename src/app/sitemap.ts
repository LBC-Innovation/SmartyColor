import type { MetadataRoute } from "next";
import { LANDING_ORDER, LANDING_PAGES, type LandingIntent } from "@/content/marketing";
import { STORY_MODE_PUBLIC } from "@/lib/auth/features";
import { SITE_URL } from "@/lib/siteUrl";

/** How much each page matters to search, 0 to 1. Pages not listed here get the default. */
const PRIORITY: Partial<Record<LandingIntent, number>> = {
  default: 1,
  gift: 0.9,
  birthday: 0.8,
  pets: 0.8,
  partners: 0.6,
  story: 0.6,
};

export default function sitemap(): MetadataRoute.Sitemap {
  const landing = LANDING_ORDER.filter((intent) => LANDING_PAGES[intent].ready && (intent !== "story" || STORY_MODE_PUBLIC)).map((intent) => ({
    path: LANDING_PAGES[intent].path,
    priority: PRIORITY[intent] ?? 0.7,
    changeFrequency: "monthly" as const,
  }));
  const pages = [...landing, { path: "/terms", priority: 0.3, changeFrequency: "yearly" as const }];
  return pages.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path === "/" ? "" : path}`,
    changeFrequency,
    priority,
  }));
}
