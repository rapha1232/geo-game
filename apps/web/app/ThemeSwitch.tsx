"use client";

import { ThemeToggle } from "@meridian/ui";
import { t } from "../lib/i18n";

export function ThemeSwitch() {
  return (
    <ThemeToggle
      label={t("theme.label")}
      optionLabels={{ system: t("theme.system"), light: t("theme.light"), dark: t("theme.dark") }}
    />
  );
}
