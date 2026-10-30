import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // `ANALYZE=1 pnpm build` writes source maps so a bundle explorer can attribute bytes (T1.20).
  productionBrowserSourceMaps: process.env["ANALYZE"] === "1",
  // Workspace packages ship TypeScript and CSS sources.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
        ],
      },
    ];
  },
  transpilePackages: [
    "@meridian/ui",
    "@meridian/game-kit",
    "@meridian/fact-pin",
    "@meridian/geo",
    "@meridian/name-matcher",
  ],
};

export default config;
