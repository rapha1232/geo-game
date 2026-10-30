"use client";

import { useEffect, useState } from "react";
import { Label, Radio, RadioGroup } from "react-aria-components";
import {
  THEME_OPTIONS,
  THEME_STORAGE_KEY,
  applyTheme,
  readThemePreference,
  saveThemePreference,
  type ThemePreference,
} from "../theme";
import styles from "./ThemeToggle.module.css";

export type ThemeToggleProps = {
  /** Visible group label, e.g. "Theme" (translated by the caller). */
  label: string;
  /** Names of the options (translated by the caller). */
  optionLabels: Record<ThemePreference, string>;
};

/** System / Light / Dark switcher. The choice is saved on this device and applied immediately. */
export function ThemeToggle({ label, optionLabels }: ThemeToggleProps) {
  // Start from "system" so server and client markup match, then read the saved choice after mount.
  const [pref, setPref] = useState<ThemePreference>("system");

  useEffect(() => {
    setPref(readThemePreference());
    const onStorage = (e: StorageEvent) => {
      if (e.key !== THEME_STORAGE_KEY) return;
      const next = readThemePreference();
      setPref(next);
      applyTheme(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const choose = (value: string) => {
    const next = THEME_OPTIONS.find((o) => o === value) ?? "system";
    setPref(next);
    applyTheme(next);
    saveThemePreference(next);
  };

  return (
    <RadioGroup
      value={pref}
      onChange={choose}
      orientation="horizontal"
      className={styles.group ?? ""}
    >
      <Label className={styles.label ?? ""}>{label}</Label>
      <div className={styles.options ?? ""}>
        {THEME_OPTIONS.map((o) => (
          <Radio key={o} value={o} className={styles.option ?? ""}>
            {optionLabels[o]}
          </Radio>
        ))}
      </div>
    </RadioGroup>
  );
}
