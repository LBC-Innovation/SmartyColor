import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
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
