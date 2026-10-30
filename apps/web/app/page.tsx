import { BRAND_NAME } from "../lib/brand";
import { ContinueCard } from "../components/shell/ContinueCard";
import { t } from "../lib/i18n";
import styles from "./page.module.css";

export default function HomePage() {
  return (
    <section className={styles.hero}>
      <h1 className={styles.title}>{BRAND_NAME}</h1>
      <p className={styles.lede}>{t("app.tagline")}</p>
      <p>{t("app.comingSoon")}</p>
      <ContinueCard />
    </section>
  );
}
