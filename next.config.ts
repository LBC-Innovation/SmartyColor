import type { NextConfig } from "next";
import { STORY_MODE_PUBLIC } from "./src/lib/auth/features";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          // The app never asks for the camera, microphone or location (photos come from the file picker).
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // Story mode is off for everyone by default, so its landing page isn't public either.
      ...(STORY_MODE_PUBLIC ? [] : [{ source: "/story", destination: "/", permanent: false }]),
      { source: "/v2", destination: "/studio", permanent: false },
      { source: "/v2/storybook", destination: "/storybook", permanent: false },
      {
        source: "/v2/vision-costs",
        destination: "/vision-costs",
        permanent: false,
      },
      { source: "/create/:path*", destination: "/studio", permanent: false },
      { source: "/photo", destination: "/studio", permanent: false },
      { source: "/library", destination: "/studio", permanent: false },
      { source: "/legacy/:path*", destination: "/studio", permanent: false },
    ];
  },
};

export default nextConfig;
