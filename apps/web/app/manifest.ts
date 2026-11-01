import type { MetadataRoute } from "next";
import { BRAND_NAME } from "../lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND_NAME,
    short_name: BRAND_NAME,
    description: "Geography games. Unlimited play. No account needed.",
    start_url: "/play",
    scope: "/",
    display: "standalone",
    background_color: "#f6f4ee",
    theme_color: "#1f3b4d",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
