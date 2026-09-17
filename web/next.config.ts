import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // The complete journey lives at /ui. Root redirects there so there is one entry point.
  async redirects() {
    return [{ source: "/", destination: "/ui", permanent: false }];
  },
  // The proxy route is the only path to Supabase; nothing here may be cached at the edge.
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "cache-control", value: "no-store" },
          { key: "x-content-type-options", value: "nosniff" },
          { key: "referrer-policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default config;
