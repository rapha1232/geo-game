import type { Entity } from "@meridian/schemas";
import type { WbSnapshot } from "./worldbank.ts";

export type StatDef = {
  id: string;
  /** Plain-English name used in prompts: "Order by {label}". */
  label: string;
  unit: string;
  /** Which end is "highest": `desc` ranks big values first, `north-south` ranks high latitudes first. */
  sort: "desc";
  /** Smallest relative gap that counts as a real difference (rank-it §5), or an absolute one for latitude. */
  separation: { relative: number } | { absolute: number };
  decimals: number;
  source_id: string;
  source_note: string;
};

export const STATS: readonly StatDef[] = [
  {
    id: "population",
    label: "population",
    unit: "people",
    sort: "desc",
    separation: { relative: 0.1 },
    decimals: 0,
    source_id: "wd",
    source_note: "Country population from the content release",
  },
  {
    id: "area",
    label: "area",
    unit: "km²",
    sort: "desc",
    separation: { relative: 0.1 },
    decimals: 0,
    source_id: "ne",
    source_note: "Country area from the content release",
  },
  {
    id: "density",
    label: "population density",
    unit: "people/km²",
    sort: "desc",
    separation: { relative: 0.1 },
    decimals: 1,
    source_id: "wd",
    source_note: "Derived: population divided by area",
  },
  {
    id: "gdp-per-capita",
    label: "GDP per capita",
    unit: "current US$",
    sort: "desc",
    separation: { relative: 0.1 },
    decimals: 0,
    source_id: "wb",
    source_note: "World Bank, World Development Indicators, NY.GDP.PCAP.CD",
  },
  {
    id: "life-expectancy",
    label: "life expectancy",
    unit: "years",
    sort: "desc",
    separation: { relative: 0.1 },
    decimals: 1,
    source_id: "wb",
    source_note: "World Bank, World Development Indicators, SP.DYN.LE00.IN",
  },
  {
    id: "capital-latitude",
    label: "capital latitude (north to south)",
    unit: "°",
    sort: "desc",
    separation: { absolute: 1 },
    decimals: 2,
    source_id: "wd",
    source_note: "Capital coordinates from the content release",
  },
];

/** `[value, year | null]` per entity. Entities without a value are simply absent (rank-it §9). */
export type IndicatorsPack = {
  pack: "core.indicators";
  version: string;
  stats: readonly StatDef[];
  values: Record<string, Record<string, [number, number | null]>>;
};

const round = (v: number, places: number): number => Number(v.toFixed(places));

/**
 * The `core.indicators` pack (T2.7): one value per country and statistic, taken from the release's own entities where
 * it can be and from the pinned World Bank snapshot for GDP and life expectancy. Pure and deterministic.
 */
export function buildIndicators(
  entities: readonly Entity[],
  wb: WbSnapshot,
  version: string,
): IndicatorsPack {
  const values: IndicatorsPack["values"] = Object.fromEntries(STATS.map((s) => [s.id, {}]));
  const put = (stat: string, id: string, v: number, year: number | null, places: number): void => {
    (values[stat] as Record<string, [number, number | null]>)[id] = [round(v, places), year];
  };
  for (const e of entities) {
    if (!e.sets?.includes("sovereign-197")) continue;
    const pop = e.population;
    const area = e.area_km2?.value;
    if (pop && pop.value > 0) put("population", e.id, pop.value, pop.year, 0);
    if (area && area > 0) put("area", e.id, area, null, 0);
    if (pop && pop.value > 0 && area && area > 0)
      put("density", e.id, pop.value / area, pop.year, 1);
    const cap = e.capitals?.find((c) => c.point);
    if (cap?.point) put("capital-latitude", e.id, cap.point[0], null, 2);
    const iso = e.id.slice("country:".length);
    const gdp = wb.indicators["NY.GDP.PCAP.CD"]?.[iso];
    if (gdp) put("gdp-per-capita", e.id, gdp[0], gdp[1], 0);
    const life = wb.indicators["SP.DYN.LE00.IN"]?.[iso];
    if (life) put("life-expectancy", e.id, life[0], life[1], 1);
  }
  const sorted = Object.fromEntries(
    Object.entries(values).map(([k, v]) => [
      k,
      Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))),
    ]),
  );
  return { pack: "core.indicators", version, stats: STATS, values: sorted };
}
