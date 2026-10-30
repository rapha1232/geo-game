import type { Metadata } from "next";
import { DailyHub } from "../../components/daily/DailyHub";
import { t } from "../../lib/i18n";

export const metadata: Metadata = { title: t("nav.daily") };

export default function Page() {
  return <DailyHub />;
}
