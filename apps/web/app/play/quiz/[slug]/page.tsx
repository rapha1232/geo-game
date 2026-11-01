import type { Metadata } from "next";
import { QuizRounds } from "../../../../components/quiz/QuizRounds";
import { QuizRunner } from "../../../../components/quiz/QuizRunner";
import { findRound } from "../../../../lib/quiz/rounds";
import { findQuiz } from "../../../../lib/quiz/library";
import { t } from "../../../../lib/i18n";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  return {
    title:
      (findQuiz((await params).slug) ?? findRound((await params).slug))?.title ?? t("qz.title"),
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return findRound(slug) ? <QuizRounds slug={slug} /> : <QuizRunner slug={slug} />;
}
