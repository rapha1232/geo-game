import type { Metadata } from "next";
import { Prose, Sections } from "../../../components/Prose";
import { COUNTRY_RULES, SCORING_RULES } from "../../../lib/rules";
import { t } from "../../../lib/i18n";

export const metadata: Metadata = { title: t("rules.title") };

export default function RulesPage() {
  return (
    <Prose title={t("rules.title")}>
      <Sections sections={COUNTRY_RULES} />
      <Sections sections={SCORING_RULES} />
    </Prose>
  );
}
