import type { Metadata } from "next";
import { EmptyPage } from "../../components/shell/EmptyPage";
import { t } from "../../lib/i18n";

export const metadata: Metadata = { title: t("nav.daily") };

export default function Page() {
  return <EmptyPage title={t("nav.daily")} body={t("empty.daily")} />;
}
