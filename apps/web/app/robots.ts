import type { MetadataRoute } from "next";
import { PRODUCTION_URL } from "../lib/brand";

export default function robots(): MetadataRoute.Robots {
  return {
    // The API and dev routes are not pages. Challenge links stay crawlable so link previews (some preview bots obey
    // robots.txt) can read their share image; the pages themselves carry `noindex`.
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/dev/"] }],
    sitemap: `${PRODUCTION_URL}/sitemap.xml`,
  };
}
