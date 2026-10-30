import type { Metadata } from "next";
import { Prose } from "../../components/Prose";
import { BRAND_NAME } from "../../lib/brand";
import { t } from "../../lib/i18n";

export const metadata: Metadata = { title: t("about.title") };

export default function AboutPage() {
  return (
    <Prose title={t("about.title")}>
      <p>{t("about.body", { brand: BRAND_NAME })}</p>
      <ul>
        <li>
          <a href="/about/sources">{t("sources.title")}</a>
        </li>
        <li>
          <a href="/terms">{t("footer.terms")}</a>
        </li>
        <li>
          <a href="/privacy">{t("footer.privacy")}</a>
        </li>
      </ul>
    </Prose>
  );
}
