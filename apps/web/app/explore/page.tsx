import type { Metadata } from "next";
import { AtlasExplorer } from "../../components/atlas/AtlasExplorer";
import { t } from "../../lib/i18n";

export const metadata: Metadata = { title: t("at.title") };

export default function Page() {
  return <AtlasExplorer />;
}
