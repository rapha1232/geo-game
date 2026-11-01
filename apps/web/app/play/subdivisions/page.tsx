import type { Metadata } from "next";
import { t } from "../../../lib/i18n";
import { SUB_COUNTRIES, subTitle } from "../../../lib/subdivisions/list";
import styles from "../../../components/subdivisions/subdivisions.module.css";

export const metadata: Metadata = { title: t("sb.title") };

export default function Page() {
  return (
    <section className={styles.page}>
      <h1>{t("sb.title")}</h1>
      <p>{t("sb.intro")}</p>
      <ul className={styles.list} aria-label={t("sb.list")}>
        {SUB_COUNTRIES.map((c) => (
          <li key={c.code}>
            <a href={`/play/subdivisions/${c.code.toLowerCase()}`}>{subTitle(c)}</a>
          </li>
        ))}
      </ul>
    </section>
  );
}
