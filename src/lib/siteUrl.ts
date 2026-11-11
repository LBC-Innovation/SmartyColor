/** Canonical site. Share images, canonical URLs, the sitemap and robots.txt resolve here, whichever host served the page. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://colorfulmemories.net").replace(/\/+$/, "");
