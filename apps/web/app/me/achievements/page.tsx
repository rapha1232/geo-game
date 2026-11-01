import type { Metadata } from "next";
import { AchievementsPage } from "../../../components/me/AchievementsPage";
import { t } from "../../../lib/i18n";

export const metadata: Metadata = { title: t("ach.title") };

export default function Page() {
  return <AchievementsPage />;
}
