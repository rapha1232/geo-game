import type { Metadata } from "next";
import { Prose, Sections } from "../../components/Prose";
import { PRIVACY, LEGAL_UPDATED } from "../../lib/legal";
import { t } from "../../lib/i18n";

export const metadata: Metadata = { title: t("privacy.title") };

export default function PrivacyPage() {
  return (
    <Prose title={t("privacy.title")} meta={t("legal.updated", { date: LEGAL_UPDATED })}>
      <Sections sections={PRIVACY} />
    </Prose>
  );
}
