"use client";

import { useEffect, useMemo, useState } from "react";
import { GameMap, type Lod, type MapFeatureState } from "@meridian/ui";
import type { Topology } from "topojson-specification";
import type { GuessRow, World } from "@meridian/silhouette";
import { t } from "../../lib/i18n";
import { useServices } from "../shell/StorageProvider";
import styles from "./silhouette.module.css";

const LABELS = {
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  zoomReset: "Reset zoom",
  focused: (name: string) => name,
  loupeHint: "",
  pinAt: (lat: number, lon: number) => `${lat}, ${lon}`,
};

/** A guess's closeness band: solid when very close, dotted when near, hatched when far (never colour alone). */
export const bandState = (proximity: number): MapFeatureState =>
  proximity >= 66 ? "correct" : proximity >= 33 ? "near" : "wrong";

/**
 * The proximity heat-map assist (silhouette §3, R2): a world map where each guessed country is filled by how close it
 * was. It shows only countries the player already named, so it never gives the answer away; it just helps them see
 * where their guesses sit.
 */
export function GuessHeatMap({ guesses, world }: { guesses: readonly GuessRow[]; world: World }) {
  const services = useServices();
  const [open, setOpen] = useState(false);
  const [lods, setLods] = useState<Partial<Record<Lod, Topology>>>({});
  useEffect(() => {
    if (!open) return;
    let live = true;
    void services?.loader
      .pack<Topology>("geo.world.110m")
      .then((p) => live && setLods({ "110m": p }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [open, services]);
  const entities = useMemo(
    () =>
      world.entities
        .filter((e) => e.type === "country")
        .map((e) => ({ id: e.id, name: e.name, labelPoint: e.ref })),
    [world],
  );
  const states = useMemo(
    () => Object.fromEntries(guesses.map((g) => [g.entityId, bandState(g.proximity)])),
    [guesses],
  );
  if (guesses.length === 0) return null;
  return (
    <div>
      <button
        type="button"
        className={styles.linkButton}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? t("sil.heat.hide") : t("sil.heat.show")}
      </button>
      {open && (
        <>
          <div className={styles.neighborMap}>
            <GameMap
              lods={lods}
              entities={entities}
              states={states}
              mode="view"
              labels={LABELS}
              aria-label={t("sil.heat.aria")}
            />
          </div>
          <p className={styles.note}>
            <span aria-hidden="true">■</span> {t("sil.heat.close")} ·{" "}
            <span aria-hidden="true">◐</span> {t("sil.heat.near")} ·{" "}
            <span aria-hidden="true">✕</span> {t("sil.heat.far")}
          </p>
        </>
      )}
    </div>
  );
}
