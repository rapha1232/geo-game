import type { Metadata } from "next";
import { AtlasExplorer } from "../../../components/atlas/AtlasExplorer";
import { t } from "../../../lib/i18n";

export const metadata: Metadata = { title: t("at.title") };

/** `/explore/country:PER` opens the Atlas with that place's card showing. */
export default async function Page({ params }: { params: Promise<{ entity: string }> }) {
  return <AtlasExplorer initialEntity={decodeURIComponent((await params).entity)} />;
}
