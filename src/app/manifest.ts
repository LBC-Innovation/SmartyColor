import type { MetadataRoute } from "next";

const APP_NAME = "ColorfulMemories";
const THEME_COLOR = "#564fd0";
const BACKGROUND_COLOR = "#fbfbfc";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: APP_NAME,
    short_name: APP_NAME,
    description:
      "Turn family photos into coloring pages and printed coloring books.",
    start_url: "/studio",
    scope: "/",
    display: "standalone",
    lang: "en",
    theme_color: THEME_COLOR,
    background_color: BACKGROUND_COLOR,
    icons: [
      { src: "/pwa/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      {
        src: "/pwa/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa/icon-192-maskable.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/pwa/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
