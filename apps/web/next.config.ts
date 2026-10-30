import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Workspace packages ship TypeScript and CSS sources.
  transpilePackages: [
    "@meridian/ui",
    "@meridian/game-kit",
    "@meridian/geo",
    "@meridian/name-matcher",
  ],
};

export default config;
