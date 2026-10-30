import type { Metadata } from "next";
import { MeProfile } from "../../components/me/MeProfile";
import { t } from "../../lib/i18n";

export const metadata: Metadata = { title: t("nav.me") };

export default function Page() {
  return <MeProfile />;
}
