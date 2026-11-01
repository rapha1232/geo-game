import type { Metadata } from "next";
import { DeepCutGame } from "../../../components/deep-cut/DeepCutGame";
import { t } from "../../../lib/i18n";

export const metadata: Metadata = { title: t("dc.title") };

export default function Page() {
  return <DeepCutGame />;
}
