import { Card } from "@meridian/ui";
import { t } from "../../../lib/i18n";
import styles from "../../../components/challenge/challenge.module.css";
import "../../../lib/messages/ch";

/** A malformed challenge link: the same friendly message the landing shows, now with a 404 status (AC-PL-016). */
export default function ChallengeNotFound() {
  return (
    <section className={styles.page}>
      <Card className={styles.card} role="alert">
        <h1>{t("ch.invalidTitle")}</h1>
        <p>{t("ch.invalidBody")}</p>
        <a className={styles.primary} href="/play/silhouette">
          {t("ch.playAgain")}
        </a>
      </Card>
    </section>
  );
}
