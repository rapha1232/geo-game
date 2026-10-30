import type { Metadata } from "next";
import { CatalogPage } from "../../components/catalog/CatalogPage";
import { t } from "../../lib/i18n";

export const metadata: Metadata = { title: t("nav.play") };

export default function Page() {
  return <CatalogPage />;
}
