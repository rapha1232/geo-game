import { BRAND_NAME } from "../lib/brand";
import { t } from "../lib/i18n";
import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from "../lib/og/card";

export const alt = `${BRAND_NAME}: ${t("app.tagline")}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogCard({
    eyebrow: t("home.eyebrow"),
    title: t("home.hero"),
    body: t("app.tagline"),
  });
}
