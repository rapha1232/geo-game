import type { Metadata } from "next";
import { FactPinGame } from "../../../../components/fact-pin/FactPinGame";
import { t } from "../../../../lib/i18n";

export const metadata: Metadata = { title: t("daily.factPin") };

export default function Page() {
  return <FactPinGame daily />;
}
