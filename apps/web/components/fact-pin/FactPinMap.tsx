"use client";

import { useCallback, useEffect, useState } from "react";
import { GameMap, type Lod, type MapFeatureState } from "@meridian/ui";
import type { Pin } from "@meridian/fact-pin";
import type { Topology } from "topojson-specification";
import { t } from "../../lib/i18n";
import { useServices } from "../shell/StorageProvider";
import type { LoadedFactPin } from "../../lib/fact-pin/data";
import styles from "./fact-pin.module.css";

const LABELS = {
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  zoomReset: "Reset zoom",
  focused: (name: string) => name,
  loupeHint: "Tap again inside the circle",
  pinAt: (lat: number, lon: number) => `Pin at ${lat}, ${lon}`,
};

/** The world map in free-pin mode. The 50m outlines come with the facts; the 110m and 10m levels load on demand. */
export function FactPinMap({
  data,
  pin,
  target,
  states,
  locked,
  onPin,
}: {
  data: LoadedFactPin;
  pin: Pin | null;
  target: Pin | null;
  states: Readonly<Record<string, MapFeatureState>>;
  /** After the reveal the pin stays where it was. */
  locked: boolean;
  onPin: (pin: Pin) => void;
}) {
  const services = useServices();
  const [lods, setLods] = useState<Partial<Record<Lod, Topology>>>({ "50m": data.topology });
  useEffect(() => {
    let live = true;
    void services?.loader
      .pack<Topology>("geo.world.110m")
      .then((p) => live && setLods((cur) => ({ ...cur, "110m": p })))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [services]);
  const onNeedLod = useCallback(
    (lod: Lod) => {
      void services?.loader
        .pack<Topology>(`geo.world.${lod}`)
        .then((p) => setLods((cur) => (cur[lod] ? cur : { ...cur, [lod]: p })))
        .catch(() => undefined);
    },
    [services],
  );
  return (
    <div className={styles.mapBox}>
      <GameMap
        lods={lods}
        entities={data.mapEntities}
        states={states}
        mode={locked ? "view" : "free-pin"}
        pin={pin}
        target={target}
        onPinChange={onPin}
        onNeedLod={onNeedLod}
        labels={LABELS}
        aria-label={t("fp.mapAria")}
      />
    </div>
  );
}
