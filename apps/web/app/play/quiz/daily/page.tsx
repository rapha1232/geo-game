import type { Metadata } from "next";
import { QuizDaily } from "../../../../components/quiz/QuizDaily";
import { t } from "../../../../lib/i18n";

export const metadata: Metadata = { title: t("daily.quiz") };

export default function Page() {
  return <QuizDaily />;
}
