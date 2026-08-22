import type { MetadataRoute } from "next";

const APP_NAME = "SmartyColor";
const THEME_COLOR = "#fff8ef";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: APP_NAME,
    short_name: APP_NAME,
    description:
      "Kids describe something they want to color. We turn it into a printable coloring sheet.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: "en",
    theme_color: THEME_COLOR,
    background_color: THEME_COLOR,
    icons: [
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
