"use client";

// Dev-only playground: strings here intentionally skip t() because the route is not shipped to production.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  GameMap,
  type Lod,
  type MapEntity,
  type MapFeatureState,
  type MapMode,
  type Pin,
} from "@meridian/ui";
import styles from "./MapPlayground.module.css";

type Manifest = {
  current: string;
  versions: Record<string, { packs: Record<string, { url: string }> }>;
};
type Pack = {
  entities: { id: string; names: { canonical: string }; label_point: [number, number] }[];
};

const LABELS = {
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  zoomReset: "Reset zoom",
  focused: (name: string) => `Focused: ${name}`,
  loupeHint: "Tap again inside the circle",
  pinAt: (lat: number, lon: number) => `Pin at ${lat}, ${lon}`,
};

export function MapPlayground() {
  const [packs, setPacks] = useState<Partial<Record<Lod, never>>>({});
  const [entities, setEntities] = useState<MapEntity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<MapMode>("select");
  const [pointer, setPointer] = useState<"fine" | "coarse" | undefined>(undefined);
  const [states, setStates] = useState<Record<string, MapFeatureState>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [pin, setPin] = useState<Pin | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const m = (await (await fetch("/content/manifest.json")).json()) as Manifest;
        setManifest(m);
        const v = m.versions[m.current];
        if (!v) throw new Error("manifest has no current version");
        const core = (await (await fetch(`/${v.packs["core.countries"]?.url}`)).json()) as Pack;
        setEntities(
          core.entities.map((e) => ({
            id: e.id,
            name: e.names.canonical,
            labelPoint: e.label_point,
          })),
        );
        setPacks({
          "110m": (await (await fetch(`/${v.packs["geo.world.110m"]?.url}`)).json()) as never,
        });
      } catch {
        setError(
          "No content found. Run `pnpm content:fetch --update-lock` once, then `pnpm content:dev`, and reload.",
        );
      }
    })();
  }, []);

  const onNeedLod = useCallback(
    (lod: Lod) => {
      const v = manifest?.versions[manifest.current];
      const url = v?.packs[`geo.world.${lod}`]?.url;
      if (!url) return;
      fetch(`/${url}`)
        .then((r) => r.json())
        .then((topo) => setPacks((p) => (p[lod] ? p : { ...p, [lod]: topo })));
    },
    [manifest],
  );

  const names = useMemo(() => new Map(entities.map((e) => [e.id, e.name] as const)), [entities]);
  const paint = (id: string | null, s: MapFeatureState) =>
    id && setStates((cur) => ({ ...cur, [id]: s }));

  if (error) return <Card>{error}</Card>;

  return (
    <div className={styles.layout}>
      <div className={styles.mapBox} data-testid="map-box">
        <GameMap
          lods={packs}
          entities={entities}
          states={states}
          mode={mode}
          pin={pin}
          onPinChange={setPin}
          onSelect={setSelected}
          onNeedLod={onNeedLod}
          labels={LABELS}
          aria-label="World map"
          {...(pointer ? { pointer } : {})}
        />
      </div>
      <Card className={styles.panel}>
        <h2>Map playground</h2>
        <div className={styles.row} role="group" aria-label="Mode">
          {(["view", "select", "highlight", "free-pin"] as const).map((m) => (
            <Button
              key={m}
              variant={mode === m ? "primary" : "secondary"}
              onPress={() => setMode(m)}
            >
              {m}
            </Button>
          ))}
        </div>
        <div className={styles.row} role="group" aria-label="Pointer">
          {([undefined, "fine", "coarse"] as const).map((p) => (
            <Button
              key={String(p)}
              variant={pointer === p ? "primary" : "secondary"}
              onPress={() => setPointer(p)}
            >
              {p ?? "auto"}
            </Button>
          ))}
        </div>
        <p className={styles.status} data-testid="selected">
          Selected:{" "}
          <span className={styles.selected}>
            {selected ? (names.get(selected) ?? selected) : "none"}
          </span>
        </p>
        <p className={styles.status} data-testid="pin">
          Pin: {pin ? `${pin.lat}, ${pin.lon}` : "none"}
        </p>
        <div className={styles.row} role="group" aria-label="Paint the selected country">
          {(["correct", "wrong", "near", "disputed", "nodata", "highlight", "idle"] as const).map(
            (s) => (
              <Button key={s} onPress={() => paint(selected, s)}>
                {s}
              </Button>
            ),
          )}
        </div>
      </Card>
    </div>
  );
}
