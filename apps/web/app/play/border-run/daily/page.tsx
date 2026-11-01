import type { Metadata } from "next";
import { BorderRunGame } from "../../../../components/border-run/BorderRunGame";
import { t } from "../../../../lib/i18n";
import "../../../../lib/messages/daily";

export const metadata: Metadata = { title: t("daily.borderRun") };

export default function Page() {
  return <BorderRunGame daily />;
}
