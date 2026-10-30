import type { Metadata } from "next";
import { QuizLibrary } from "../../../components/quiz/QuizLibrary";
import { t } from "../../../lib/i18n";

export const metadata: Metadata = { title: t("qz.title") };

export default function Page() {
  return <QuizLibrary />;
}
