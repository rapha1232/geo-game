"use client";

import { useEffect } from "react";
import { applySettings, loadSettings } from "../../lib/settings/settings";
import { useServices } from "./StorageProvider";

/** Applies the saved display settings (reduced motion, high-contrast map) as soon as storage is ready. */
export function SettingsApplier() {
  const services = useServices();
  useEffect(() => {
    if (!services) return;
    void loadSettings(services.db).then((s) => applySettings(s));
  }, [services]);
  return null;
}
