import type { NextConfig } from "next";

const scriptPolicy = process.env.NODE_ENV === "development"
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["postgres"],
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.voicesoftheshoah.org" }],
        destination: "https://voicesoftheshoah.org/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          {
            key: "Content-Security-Policy",
            value:
              `default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self' data:; form-action 'self'; frame-ancestors 'self'; img-src 'self' data: https:; media-src 'self' blob:; object-src 'none'; ${scriptPolicy}; style-src 'self' 'unsafe-inline'; upgrade-insecure-requests`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
