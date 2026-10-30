import { t } from "../lib/i18n";
import styles from "./page.module.css";

// Our own 404: the framework default ships an inline <style>, which the CSP (AC-PL-025) rightly blocks.
export default function NotFound() {
  return (
    <section className={styles.hero}>
      <h1 className={styles.title}>{t("notFound.title")}</h1>
      <p className={styles.lede}>{t("notFound.body")}</p>
      <p>
        <a href="/">{t("notFound.home")}</a>
      </p>
    </section>
  );
}
