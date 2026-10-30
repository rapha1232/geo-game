import { BRAND_NAME } from "../lib/brand";
import { t } from "../lib/i18n";

export default function HomePage() {
  return (
    <>
      <h1>{BRAND_NAME}</h1>
      <p>{t("app.tagline")}</p>
      <p>{t("app.comingSoon")}</p>
    </>
  );
}
