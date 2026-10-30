import type { Metadata } from "next";
import { SilhouetteGame } from "../../../components/silhouette/SilhouetteGame";
import { t } from "../../../lib/i18n";

export const metadata: Metadata = { title: t("sil.title") };

export default function Page() {
  return <SilhouetteGame />;
}
