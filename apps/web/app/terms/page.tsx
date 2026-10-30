import type { Metadata } from "next";
import { Prose, Sections } from "../../components/Prose";
import { TERMS, LEGAL_UPDATED } from "../../lib/legal";
import { t } from "../../lib/i18n";

export const metadata: Metadata = { title: t("terms.title") };

export default function TermsPage() {
  return (
    <Prose title={t("terms.title")} meta={t("legal.updated", { date: LEGAL_UPDATED })}>
      <Sections sections={TERMS} />
    </Prose>
  );
}
