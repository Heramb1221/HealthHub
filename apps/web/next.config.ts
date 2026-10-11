import type { NextConfig } from "next";

const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:4000";
const isLive = process.env.NEXT_PUBLIC_API_MODE === "live";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    // Same-origin proxy so the API's httpOnly session cookie is first-party and CORS is not needed.
    if (!isLive) return [];
    return [{ source: "/api/v1/:path*", destination: `${API_ORIGIN}/api/v1/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
