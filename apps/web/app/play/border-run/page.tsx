import type { Metadata } from "next";
import { BorderRunGame } from "../../../components/border-run/BorderRunGame";
import { t } from "../../../lib/i18n";
import "../../../lib/messages/br";

export const metadata: Metadata = { title: t("br.title") };

export default function Page() {
  return <BorderRunGame />;
}
