import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@meridian/ui";
import { t } from "../../lib/i18n";

export const metadata: Metadata = { title: t("nav.play") };

export default function Page() {
  return (
    <section style={{ maxWidth: "64rem", margin: "0 auto", padding: "var(--space-4)" }}>
      <h1>{t("nav.play")}</h1>
      <Card
        as="article"
        style={{ padding: "var(--space-4)", display: "grid", gap: "var(--space-2)" }}
      >
        <h2 style={{ margin: 0 }}>{t("sil.title")}</h2>
        <p style={{ margin: 0 }}>{t("play.silhouette")}</p>
        <Link href="/play/silhouette">{t("play.start")}</Link>
      </Card>
    </section>
  );
}
