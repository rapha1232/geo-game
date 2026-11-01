import type { Metadata } from "next";
import { FactPinGame } from "../../../components/fact-pin/FactPinGame";
import { t } from "../../../lib/i18n";
import "../../../lib/messages/fp";

export const metadata: Metadata = { title: t("fp.title") };

export default function Page() {
  return <FactPinGame />;
}
