import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

/** The content release this build serves (the Vercel build packs it into /content). `/api/v1/health` reports it. */
function readContentVersion(): string {
  if (process.env["CONTENT_VERSION"]) return process.env["CONTENT_VERSION"];
  try {
    // Builds run from apps/web (turbo and `next build` both use the package directory).
    return readFileSync(resolve(process.cwd(), "../../content/version.txt"), "utf8").trim();
  } catch {
    return "";
  }
}
const contentVersion = readContentVersion();

/** PostHog's region for the first-party proxy (`/ingest`): "us" (default) or "eu", set by the owner. */
const posthogHost = process.env["NEXT_PUBLIC_POSTHOG_REGION"] === "eu" ? "eu" : "us";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  env: { CONTENT_VERSION: contentVersion },
  // PostHog's API paths end in a slash; Next must not redirect them.
  skipTrailingSlashRedirect: true,
  // Usage statistics leave through our own origin, so no page talks to a third party (AC-PL-003).
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: `https://${posthogHost}-assets.i.posthog.com/static/:path*`,
      },
      { source: "/ingest/:path*", destination: `https://${posthogHost}.i.posthog.com/:path*` },
    ];
  },
  // `ANALYZE=1 pnpm build` writes source maps so a bundle explorer can attribute bytes (T1.20).
  productionBrowserSourceMaps: process.env["ANALYZE"] === "1",
  // Workspace packages ship TypeScript and CSS sources.
  async headers() {
    return [
      {
        // A stale service worker would keep serving stale pages, so browsers must always re-check it.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // Content packs carry their hash in the file name inside a versioned folder, so a URL never changes meaning.
        // manifest.json (which points at them) stays revalidated.
        source: "/content/:version/:file([^/]+\\.[0-9a-f]{6}\\.json)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
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

/**
 * Sentry's build step uploads source maps (so stack traces show our code) when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and
 * `SENTRY_PROJECT` are set, then deletes them so they are never served. Without the token it uploads nothing.
 */
export default withSentryConfig(config, {
  silent: !process.env["CI"],
  telemetry: false,
  sourcemaps: {
    disable: !process.env["SENTRY_AUTH_TOKEN"],
    deleteSourcemapsAfterUpload: true,
  },
  widenClientFileUpload: true,
});
