import type { MetadataRoute } from "next";
import { BRAND_NAME } from "../lib/brand";
import { t } from "../lib/i18n";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND_NAME,
    short_name: BRAND_NAME,
    description: t("app.tagline"),
    start_url: "/play",
    scope: "/",
    display: "standalone",
    background_color: "#f7f4ee",
    theme_color: "#b4532a",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
