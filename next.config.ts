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
      {
        source: "/create/:path*",
        destination: "/legacy/create/:path*",
        permanent: false,
      },
      { source: "/photo", destination: "/legacy/photo", permanent: false },
      { source: "/library", destination: "/legacy/library", permanent: false },
    ];
  },
};

export default nextConfig;
