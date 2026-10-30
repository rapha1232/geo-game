import {
  haversineKm,
  proximityPercent,
  rhumbBearing,
  roundKm,
  sector8,
  KM_PER_MILE,
} from "@meridian/geo";
import type { DistanceUnit, GuessRow, SilEntity } from "./types";

/** Distance, direction and proximity between two entities' ref points (silhouette §5.3). */
export function feedback(
  guess: SilEntity,
  target: SilEntity,
  sharesBorder: boolean,
): Omit<GuessRow, "input" | "note"> {
  const correct = guess.id === target.id;
  const from = { lat: guess.ref[0], lon: guess.ref[1] };
  const to = { lat: target.ref[0], lon: target.ref[1] };
  const km = correct ? 0 : haversineKm(from, to);
  const same = correct || (from.lat === to.lat && from.lon === to.lon);
  const bearing = same ? null : rhumbBearing(from, to);
  return {
    entityId: guess.id,
    correct,
    distanceKm: roundKm(km),
    bearing: bearing === null ? null : Math.round(bearing) % 360,
    sector: bearing === null ? null : sector8(bearing),
    proximity: proximityPercent(km, correct),
    sharesBorder: !correct && sharesBorder,
  };
}

/** Whole-number distance in the chosen unit, grouped with commas ("8,651"). */
export function formatDistance(km: number, unit: DistanceUnit): string {
  const n = Math.round(unit === "mi" ? km / KM_PER_MILE : km);
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

const SECTOR_WORDS = {
  N: "north",
  NE: "north-east",
  E: "east",
  SE: "south-east",
  S: "south",
  SW: "south-west",
  W: "west",
  NW: "north-west",
} as const;
export const sectorWord = (s: keyof typeof SECTOR_WORDS): string => SECTOR_WORDS[s];

/** The ▰▱ proximity bar: 10 segments, one per 10% (floor). */
export const proximityBar = (percent: number): string =>
  "▰".repeat(Math.floor(percent / 10)) + "▱".repeat(10 - Math.floor(percent / 10));

/** Screen-reader text after a guess (silhouette §7.2, AC-SH-018). English default copy; the UI may localize it. */
export function announceGuess(
  row: GuessRow,
  name: string,
  n: number,
  max: number | null,
  unit: DistanceUnit,
): string {
  const head = `Guess ${n}${max ? ` of ${max}` : ""}: ${name}.`;
  if (row.correct)
    return `${head} Correct. 0 ${unit === "mi" ? "miles" : "kilometres"}, 100 percent.`;
  const dir = row.sector ? sectorWord(row.sector) : "same point";
  const dist = `${formatDistance(row.distanceKm, unit)} ${unit === "mi" ? "miles" : "kilometres"}`;
  return `${head} ${dist}, ${dir}, ${row.proximity} percent.${row.sharesBorder ? " Shares a border." : ""}`;
}
