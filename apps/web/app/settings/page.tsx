import type { Metadata } from "next";
import { SettingsPage } from "../../components/settings/SettingsPage";
import { t } from "../../lib/i18n";

export const metadata: Metadata = { title: t("nav.settings") };

export default function Page() {
  return <SettingsPage />;
}
