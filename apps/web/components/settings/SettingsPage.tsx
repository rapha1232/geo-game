"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Dialog } from "@meridian/ui";
import { ThemeSwitch } from "../../app/ThemeSwitch";
import { t, type MessageKey } from "../../lib/i18n";
import {
  DEFAULT_SETTINGS,
  applySettings,
  loadSettings,
  saveSettings,
  type CountrySet,
  type Settings,
  type Strictness,
  type Units,
} from "../../lib/settings/settings";
import {
  ImportError,
  deleteAll,
  exportData,
  importData,
  parseExport,
} from "../../lib/settings/data";
import { useServices } from "../shell/StorageProvider";
import styles from "./settings.module.css";

const UNITS: Units[] = ["auto", "km", "mi"];
const STRICT: Strictness[] = ["lenient", "standard", "strict"];
const SETS: CountrySet[] = ["sovereign-197", "un-193"];

/** `/settings` (UX_AND_DESIGN §3.6): every change saves and applies at once; data export, import and deletion. */
export function SettingsPage() {
  const services = useServices();
  const [s, setS] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState<boolean | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const file = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!services) return;
    let live = true;
    void loadSettings(services.db).then((loaded) => {
      if (!live) return;
      setS(loaded);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, [services]);

  const change = (patch: Partial<Settings>) => {
    const next = { ...s, ...patch };
    setS(next);
    applySettings(next);
    if (services) void saveSettings(services.db, next).then(setSaved);
  };

  const doExport = async () => {
    if (!services) return;
    const data = await exportData(services.db, Date.now());
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `meridian-export-${data.exported_at.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ tone: "ok", text: t("set.exported", { n: data.results.length }) });
  };

  const doImport = async (f: File | undefined) => {
    if (!services || !f) return;
    try {
      const summary = await importData(services.db, parseExport(await f.text()));
      setS(await loadSettings(services.db));
      applySettings(await loadSettings(services.db));
      setMessage({
        tone: "ok",
        text: t("set.importDone", { results: summary.results, skipped: summary.skipped }),
      });
    } catch (e) {
      const reason = e instanceof ImportError ? e.message : "storage";
      setMessage({ tone: "error", text: t(`set.importFail.${reason}` as MessageKey) });
    } finally {
      if (file.current) file.current.value = "";
    }
  };

  const doDelete = async () => {
    if (!services) return;
    await deleteAll(services.db);
    setConfirmDelete(false);
    setS(DEFAULT_SETTINGS);
    applySettings(DEFAULT_SETTINGS);
    setMessage({ tone: "ok", text: t("set.deleted") });
  };

  return (
    <div className={styles.page}>
      <h1>{t("set.title")}</h1>

      <section className={styles.group} aria-labelledby="set-display">
        <h2 id="set-display">{t("set.display")}</h2>
        <div className={styles.field}>
          <span id="set-theme">{t("set.theme")}</span>
          <ThemeSwitch />
        </div>
        <label className={styles.field}>
          {t("set.motion")}
          <select
            value={s.reducedMotion}
            disabled={!ready}
            onChange={(e) => change({ reducedMotion: e.target.value as Settings["reducedMotion"] })}
          >
            <option value="system">{t("set.motion.system")}</option>
            <option value="reduce">{t("set.motion.reduce")}</option>
          </select>
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={s.highContrast}
            disabled={!ready}
            onChange={(e) => change({ highContrast: e.target.checked })}
          />
          {t("set.contrast")}
        </label>
      </section>

      <section className={styles.group} aria-labelledby="set-play">
        <h2 id="set-play">{t("set.play")}</h2>
        <label className={styles.field}>
          {t("set.units")}
          <select
            value={s.units}
            disabled={!ready}
            onChange={(e) => change({ units: e.target.value as Units })}
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {t(`set.units.${u}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          {t("set.strictness")}
          <select
            value={s.strictness}
            disabled={!ready}
            onChange={(e) => change({ strictness: e.target.value as Strictness })}
          >
            {STRICT.map((x) => (
              <option key={x} value={x}>
                {t(`set.strictness.${x}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          {t("set.countrySet")}
          <select
            value={s.countrySet}
            disabled={!ready}
            onChange={(e) => change({ countrySet: e.target.value as CountrySet })}
          >
            {SETS.map((x) => (
              <option key={x} value={x}>
                {t(`set.countrySet.${x}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={s.accessibleDefault}
            disabled={!ready}
            onChange={(e) => change({ accessibleDefault: e.target.checked })}
          />
          {t("set.accessible")}
        </label>
        <p role="status" className={styles.note}>
          {saved === true ? t("set.saved") : saved === false ? t("set.saveFailed") : ""}
        </p>
      </section>

      <section className={styles.group} aria-labelledby="set-data">
        <h2 id="set-data">{t("set.data")}</h2>
        <p>{t("set.dataBody")}</p>
        <div className={styles.row}>
          <Button onPress={() => void doExport()}>{t("set.export")}</Button>
          <Button onPress={() => file.current?.click()}>{t("set.import")}</Button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            className={styles.hidden}
            aria-label={t("set.import")}
            onChange={(e) => void doImport(e.target.files?.[0])}
          />
        </div>
        <p className={styles.note}>{t("set.importHelp")}</p>
        <div className={styles.row}>
          <Button variant="ghost" onPress={() => setConfirmDelete(true)}>
            {t("set.delete")}
          </Button>
        </div>
        <p role={message?.tone === "error" ? "alert" : "status"}>{message?.text ?? ""}</p>
      </section>

      <Dialog
        isOpen={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("set.deleteTitle")}
        closeLabel={t("rp.close")}
      >
        <p>{t("set.deleteBody")}</p>
        <Button variant="primary" onPress={() => void doDelete()}>
          {t("set.deleteConfirm")}
        </Button>
      </Dialog>
    </div>
  );
}
