import type { MetadataRoute } from "next";
import { LANDING_ORDER, LANDING_PAGES } from "@/content/marketing";
import { STORY_MODE_PUBLIC } from "@/lib/auth/features";
import { SITE_URL } from "@/lib/siteUrl";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: [
        ...LANDING_ORDER.filter((intent) => LANDING_PAGES[intent].ready && (intent !== "story" || STORY_MODE_PUBLIC)).map((intent) => LANDING_PAGES[intent].path),
        "/terms",
      ],
      // The app, accounts, share links and the API are private or per-person.
      disallow: [
        "/studio",
        "/home",
        "/account",
        "/orders",
        "/admin",
        "/api/",
        "/p/",
        "/sign-in",
        "/sign-up",
        "/forgot-password",
        "/reset-password",
        "/auth/",
        "/storybook",
        "/activity",
        "/vision-costs",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
