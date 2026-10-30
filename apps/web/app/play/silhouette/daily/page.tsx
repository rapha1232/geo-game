import type { Metadata } from "next";
import { SilhouetteGame } from "../../../../components/silhouette/SilhouetteGame";
import { t } from "../../../../lib/i18n";

export const metadata: Metadata = { title: t("daily.silhouette") };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ practice?: string }>;
}) {
  const { practice } = await searchParams;
  return <SilhouetteGame daily practice={practice === "1"} />;
}
