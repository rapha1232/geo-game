"use client";

import { t } from "../../lib/i18n";
import { useServices } from "./StorageProvider";
import styles from "./shell.module.css";

/** Storage and connectivity notices (UX_AND_DESIGN §8). Polite live region, never blocks play. */
export function SystemBanners() {
  const s = useServices();
  const storageDown = s === null ? false : s.status === "unavailable";
  const offline = s ? !s.online : false;
  return (
    <div role="status" className={styles.banners}>
      {storageDown && <p className={styles.banner}>{t("state.storageUnavailable")}</p>}
      {offline && <p className={styles.banner}>{t("state.offline")}</p>}
    </div>
  );
}
