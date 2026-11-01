"use client";

import { useEffect, useState } from "react";
import { Label, Radio, RadioGroup } from "react-aria-components";
import {
  MAP_STYLES,
  MAP_STYLE_EVENT,
  MAP_STYLE_STORAGE_KEY,
  MAP_STYLE_SWATCH,
  DEFAULT_MAP_STYLE,
  applyMapStyle,
  readMapStyle,
  setMapStyle,
  type MapStyle,
} from "../map/mapStyle";
import { cx } from "./cx";
import styles from "./MapStylePicker.module.css";

export type MapStylePickerProps = {
  /** Visible group label, e.g. "Map style" (translated by the caller). */
  label: string;
  /** Names of the styles (translated by the caller). */
  names: Record<MapStyle, string>;
  /** Short descriptions shown under each name in the full layout. */
  descriptions?: Partial<Record<MapStyle, string>>;
  /** Compact: a tight list for the popover on the map. */
  compact?: boolean;
  /** Visually hide the group label (it stays the accessible name). */
  hideLabel?: boolean;
  onChange?: (style: MapStyle) => void;
  autoFocus?: boolean;
};

/** Keeps a component in step with the saved map style, in this tab and in others. */
export function useMapStyle(): [MapStyle, (s: MapStyle) => void] {
  const [style, setStyle] = useState<MapStyle>(DEFAULT_MAP_STYLE);
  useEffect(() => {
    const sync = () => setStyle(readMapStyle());
    sync();
    const onStorage = (e: StorageEvent) => {
      if (e.key !== MAP_STYLE_STORAGE_KEY) return;
      const next = readMapStyle();
      applyMapStyle(next);
      setStyle(next);
    };
    window.addEventListener(MAP_STYLE_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(MAP_STYLE_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return [
    style,
    (s: MapStyle) => {
      setStyle(s);
      setMapStyle(s);
    },
  ];
}

/** A tiny map-like swatch: sea, a landmass with its border, and the style's coast accent. */
export function MapStyleSwatch({ style }: { style: MapStyle }) {
  const [sea, land, border, accent] = MAP_STYLE_SWATCH[style];
  return (
    <svg className={styles.swatch} viewBox="0 0 64 40" aria-hidden="true">
      <rect width="64" height="40" fill={sea} />
      {style === "blueprint" && (
        <path
          d="M0 10H64M0 20H64M0 30H64M16 0V40M32 0V40M48 0V40"
          stroke={accent}
          strokeOpacity=".35"
          strokeWidth=".6"
        />
      )}
      <path
        d="M8 30c2-9 9-15 17-15 5 0 6-6 13-6 8 0 14 6 14 12 0 7-8 9-14 10-9 1-15 3-22 2-5 0-8-1-8-3z"
        fill="none"
        stroke={accent}
        strokeWidth={style === "midnight" ? 3 : 2.2}
        strokeOpacity={style === "ink" ? 0 : 0.55}
      />
      <path
        d="M8 30c2-9 9-15 17-15 5 0 6-6 13-6 8 0 14 6 14 12 0 7-8 9-14 10-9 1-15 3-22 2-5 0-8-1-8-3z"
        fill={land}
        stroke={border}
        strokeWidth="1"
      />
      {style === "political" && (
        <path
          d="M25 15c1 6 3 11 2 17M27 23c6-1 12 1 18-2"
          fill="none"
          stroke={border}
          strokeWidth="1"
        />
      )}
      {style === "political" && (
        <path d="M38 9c8 0 14 6 14 12-4-1-6-1-7 0-2-5-4-9-7-12z" fill={accent} />
      )}
      {style !== "political" && (
        <path
          d="M25 15c1 6 3 11 2 17M27 23c6-1 12 1 18-2"
          fill="none"
          stroke={border}
          strokeWidth=".8"
        />
      )}
    </svg>
  );
}

/** Lets the player pick how maps look. The choice is saved on this device and applies to every map at once. */
export function MapStylePicker({
  label,
  names,
  descriptions,
  compact = false,
  hideLabel = false,
  onChange,
  autoFocus,
}: MapStylePickerProps) {
  const [style, choose] = useMapStyle();
  return (
    <RadioGroup
      value={style}
      onChange={(v) => {
        const next = MAP_STYLES.find((s) => s === v) ?? DEFAULT_MAP_STYLE;
        choose(next);
        onChange?.(next);
      }}
      className={cx(styles.group, compact && styles.compact)}
    >
      <Label className={cx(styles.label, hideLabel && "visually-hidden")}>{label}</Label>
      <div className={styles.options}>
        {MAP_STYLES.map((s) => (
          <Radio
            key={s}
            value={s}
            className={styles.option ?? ""}
            {...(autoFocus && s === style ? { autoFocus: true } : {})}
          >
            <MapStyleSwatch style={s} />
            <span className={styles.text}>
              <span className={styles.name}>{names[s]}</span>
              {!compact && descriptions?.[s] && (
                <span className={styles.desc}>{descriptions[s]}</span>
              )}
            </span>
            <span className={styles.tick} aria-hidden="true">
              ✓
            </span>
          </Radio>
        ))}
      </div>
    </RadioGroup>
  );
}
