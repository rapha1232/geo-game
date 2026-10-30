import type { Metadata } from "next";
import { ChallengeLanding } from "../../../components/challenge/ChallengeLanding";
import { t } from "../../../lib/i18n";

export const metadata: Metadata = { title: t("ch.landingTitle"), robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  return <ChallengeLanding code={decodeURIComponent((await params).code)} />;
}
