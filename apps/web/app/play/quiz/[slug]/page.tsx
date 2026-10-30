import type { Metadata } from "next";
import { QuizRunner } from "../../../../components/quiz/QuizRunner";
import { findQuiz } from "../../../../lib/quiz/library";
import { t } from "../../../../lib/i18n";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  return { title: findQuiz((await params).slug)?.title ?? t("qz.title") };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <QuizRunner slug={(await params).slug} />;
}
