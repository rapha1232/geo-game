"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  GameMap,
  type Lod,
  type MapEntity,
  type MapFeatureState,
  type MapMode,
} from "@meridian/ui";
import type { QuizWorld } from "@meridian/quiz";
import { t } from "../../lib/i18n";
import { useServices } from "../shell/StorageProvider";
import styles from "./quiz.module.css";

const LABELS = {
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  zoomReset: "Reset zoom",
  focused: (name: string) => name,
  loupeHint: "Tap again inside the circle",
  pinAt: (lat: number, lon: number) => `${lat}, ${lon}`,
};

/** The world map for quizzes. Loads the 110m outlines first and finer ones as the player zooms. */
export function QuizMap({
  world,
  labelPoints,
  states,
  mode,
  onSelect,
}: {
  world: QuizWorld;
  labelPoints: ReadonlyMap<string, readonly [number, number]>;
  states: Readonly<Record<string, MapFeatureState>>;
  mode: MapMode;
  onSelect?: (id: string) => void;
}) {
  const services = useServices();
  const [lods, setLods] = useState<Partial<Record<Lod, never>>>({});
  useEffect(() => {
    let live = true;
    void services?.loader
      .pack<never>("geo.world.110m")
      .then((p) => live && setLods((cur) => ({ ...cur, "110m": p })))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [services]);
  const onNeedLod = useCallback(
    (lod: Lod) => {
      void services?.loader
        .pack<never>(`geo.world.${lod}`)
        .then((p) => setLods((cur) => (cur[lod] ? cur : { ...cur, [lod]: p })))
        .catch(() => undefined);
    },
    [services],
  );
  const entities: MapEntity[] = useMemo(
    () =>
      world.entities.map((e) => ({
        id: e.id,
        name: e.name,
        labelPoint: (labelPoints.get(e.id) ?? [0, 0]) as readonly [number, number],
      })),
    [world, labelPoints],
  );
  return (
    <div className={styles.mapBox}>
      <GameMap
        lods={lods}
        entities={entities}
        states={states}
        mode={mode}
        {...(onSelect ? { onSelect } : {})}
        onNeedLod={onNeedLod}
        labels={LABELS}
        aria-label={t("qz.mapAria")}
      />
    </div>
  );
}
