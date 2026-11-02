"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
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
import "../../lib/messages/qz";
import { mapLabels } from "../../lib/map/labels";

const LABELS = mapLabels();

/**
 * The world map for quizzes. Loads the 110m outlines first and finer ones as the player zooms. Memoised: the quiz
 * re-renders on every keystroke and clock tick, and the map should only hear about its own props changing.
 */
export const QuizMap = memo(function QuizMap({
  world,
  labelPoints,
  states,
  markers,
  mode,
  onSelect,
  items,
}: {
  world: QuizWorld;
  /** Ids of the quiz's answers; used only to pick the region to frame. */
  items?: readonly string[];
  labelPoints: ReadonlyMap<string, readonly [number, number]>;
  states: Readonly<Record<string, MapFeatureState>>;
  markers?: ReadonlySet<string>;
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
  // Frame the map on the quiz's continent when all its answers share one. The whole continent, never just
  // the answers, so the framing gives nothing away.
  const focusKey = items?.join(",") ?? "";
  const focus = useMemo(() => {
    const continents = new Set((items ?? []).map((id) => world.byId.get(id)?.continent ?? ""));
    if (continents.size !== 1 || continents.has("")) return undefined;
    const [c] = continents;
    return world.entities.filter((e) => e.continent === c).map((e) => e.id);
  }, [focusKey, world]);
  return (
    <div className={styles.mapBox}>
      <GameMap
        lods={lods}
        entities={entities}
        states={states}
        {...(markers ? { markers } : {})}
        mode={mode}
        {...(focus ? { focus } : {})}
        {...(onSelect ? { onSelect } : {})}
        onNeedLod={onNeedLod}
        labels={LABELS}
        aria-label={t("qz.mapAria")}
      />
    </div>
  );
});
