"use client";

import { useEffect, useMemo, useState } from "react";
import { GameMap, type Lod, type MapEntity, type MapFeatureState } from "@meridian/ui";
import { gameResult, type GameResult } from "@meridian/schemas";
import { t, type MessageKey } from "../../lib/i18n";
import type { MasteryRecord } from "../../lib/storage/db";
import { bandOf, masteryByEntity } from "../../lib/results/stats";
import { useServices } from "../shell/StorageProvider";
import { MeView } from "./MeView";
import styles from "./me.module.css";

type Pack = {
  entities: { id: string; names: { canonical: string }; label_point: [number, number] }[];
};

const LABELS = {
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  zoomReset: "Reset zoom",
  focused: (name: string) => name,
  loupeHint: "",
  pinAt: (lat: number, lon: number) => `${lat}, ${lon}`,
};
const BAND_STATE = { strong: "correct", learning: "near", weak: "wrong" } as const;

/** Reads the local results and mastery, builds the mastery map, and renders the profile. */
export function MeProfile() {
  const services = useServices();
  const [results, setResults] = useState<GameResult[] | null>(null);
  const [mastery, setMastery] = useState<MasteryRecord[]>([]);
  const [failed, setFailed] = useState(false);
  const [entities, setEntities] = useState<MapEntity[]>([]);
  const [lods, setLods] = useState<Partial<Record<Lod, never>>>({});

  useEffect(() => {
    if (!services) return;
    let live = true;
    void (async () => {
      try {
        const rows = await services.db.results.toArray();
        const parsed = rows.flatMap((r) => {
          const p = gameResult.safeParse(r.data);
          return p.success ? [p.data] : [];
        });
        const m = await services.db.mastery.toArray();
        if (!live) return;
        setResults(parsed);
        setMastery(m);
        if (m.length > 0) {
          try {
            const core = await services.loader.pack<Pack>("core.countries");
            const world = await services.loader.pack<never>("geo.world.110m");
            if (!live) return;
            setEntities(
              core.entities.map((e) => ({
                id: e.id,
                name: e.names.canonical,
                labelPoint: e.label_point,
              })),
            );
            setLods({ "110m": world });
          } catch {
            /* the map is optional: stats still show */
          }
        }
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [services]);

  const by = useMemo(() => masteryByEntity(mastery), [mastery]);
  const states = useMemo(() => {
    const out: Record<string, MapFeatureState> = {};
    for (const e of entities) {
      const m = by.get(e.id);
      out[e.id] = m ? BAND_STATE[bandOf(m.mean)] : "nodata";
    }
    return out;
  }, [entities, by]);

  if (failed) return <p role="alert">{t("me.loadError")}</p>;
  if (!results) return <p role="status">{t("sil.loading")}</p>;

  const map =
    entities.length > 0 && lods["110m"] ? (
      <>
        <div className={styles.mapBox}>
          <GameMap
            lods={lods}
            entities={entities}
            states={states}
            mode="view"
            aria-label={t("me.mastery")}
            labels={LABELS}
          />
        </div>
        <ul className={styles.legend}>
          {(["strong", "learning", "weak"] as const).map((b) => (
            <li key={b}>
              <span aria-hidden="true">{{ strong: "✓", learning: "◐", weak: "✕" }[b]}</span>{" "}
              {t(`me.band.${b}` as MessageKey)}
            </li>
          ))}
          <li>{t("me.band.none")}</li>
        </ul>
      </>
    ) : null;

  return (
    <MeView results={results} masteryMap={map} offsetMinutes={-new Date().getTimezoneOffset()} />
  );
}
