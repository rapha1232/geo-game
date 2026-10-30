import type { Metadata } from "next";
import { Prose } from "../../../components/Prose";
import corrections from "../../../lib/generated/corrections.json";
import { t } from "../../../lib/i18n";

export const metadata: Metadata = { title: t("corrections.title") };

export default function CorrectionsPage() {
  return (
    <Prose title={t("corrections.title")}>
      <p>{t("corrections.intro")}</p>
      {corrections.map((r) => (
        <section key={r.version} data-release={r.version}>
          <h2>
            {r.version} <small>({r.date})</small>
          </h2>
          <ul>
            {r.changes.map((c) => (
              <li key={`${c.kind}-${c.text}`}>{c.text}</li>
            ))}
          </ul>
        </section>
      ))}
      <p>{t("corrections.report")}</p>
    </Prose>
  );
}
