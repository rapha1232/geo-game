import type { Metadata } from "next";
import { Prose } from "../../../components/Prose";
import sources from "../../../lib/generated/sources.json";
import { t } from "../../../lib/i18n";

export const metadata: Metadata = { title: t("sources.title") };

type Source = (typeof sources)[number];
const KIND_ORDER = ["dataset", "font", "icons", "image"] as const;

export default function SourcesPage() {
  const groups = KIND_ORDER.map((kind) => ({
    kind,
    items: sources.filter((s: Source) => s.kind === kind),
  })).filter((g) => g.items.length > 0);
  return (
    <Prose title={t("sources.title")}>
      <p>{t("sources.intro")}</p>
      {groups.map((g) => (
        <section key={g.kind}>
          <h2>{t(`sources.kind.${g.kind}`)}</h2>
          <ul>
            {g.items.map((s: Source) => (
              <li key={s.id} data-source={s.id}>
                <strong>{s.name}</strong>. {s.license}
                {s.licenseUrl && (
                  <>
                    {" "}
                    (
                    <a href={s.licenseUrl} rel="noreferrer noopener">
                      {t("sources.licence")}
                    </a>
                    )
                  </>
                )}
                {s.attribution && <> {s.attribution}</>}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p>{t("sources.naturalEarth")}</p>
    </Prose>
  );
}
