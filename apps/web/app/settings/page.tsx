import type { Metadata } from "next";
import { EmptyPage } from "../../components/shell/EmptyPage";
import { t } from "../../lib/i18n";

export const metadata: Metadata = { title: t("nav.settings") };

export default function Page() {
  return <EmptyPage title={t("nav.settings")} body={t("empty.settings")} />;
}
