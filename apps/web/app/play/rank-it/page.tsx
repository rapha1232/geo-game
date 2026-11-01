import type { Metadata } from "next";
import { RankItGame } from "../../../components/rank-it/RankItGame";
import { t } from "../../../lib/i18n";

export const metadata: Metadata = { title: t("rk.title") };

export default function Page() {
  return <RankItGame />;
}
