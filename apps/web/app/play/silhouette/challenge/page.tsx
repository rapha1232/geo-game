import type { Metadata } from "next";
import { ChallengeCreate } from "../../../../components/challenge/ChallengeCreate";
import { SilhouetteGame } from "../../../../components/silhouette/SilhouetteGame";
import { t } from "../../../../lib/i18n";

export const metadata: Metadata = { title: t("ch.landingTitle"), robots: { index: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  return c ? <SilhouetteGame challenge={c} /> : <ChallengeCreate />;
}
