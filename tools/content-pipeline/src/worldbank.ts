import { stableStringify, USER_AGENT } from "./util.ts";

/** World Bank indicators shipped in the `core.indicators` pack (rank-it §4). Population and area come from `core.countries`. */
export const WB_INDICATORS = [
  { code: "NY.GDP.PCAP.CD", id: "gdp-per-capita" },
  { code: "SP.DYN.LE00.IN", id: "life-expectancy" },
] as const;

/** World Bank labels Kosovo "XKX" already. Aggregates ("WLD", "EUU", ...) are dropped when the pack is built. */
export type WbSnapshot = {
  retrieved_on: string;
  endpoint: string;
  /** Indicator code -> ISO3 -> [value, year]. */
  indicators: Record<string, Record<string, [number, number]>>;
};

type WbRow = { countryiso3code?: string; value: number | null; date: string };
type Fetcher = (url: string, init?: { headers: Record<string, string> }) => Promise<Response>;

const ENDPOINT = "https://api.worldbank.org/v2";

/** Most recent non-empty value per country for each indicator (`mrnev=1`). */
export async function fetchWorldBank(retrievedOn: string, fetcher: Fetcher): Promise<WbSnapshot> {
  const indicators: WbSnapshot["indicators"] = {};
  for (const ind of WB_INDICATORS) {
    const url = `${ENDPOINT}/country/all/indicator/${ind.code}?format=json&per_page=20000&mrnev=1`;
    const res = await fetcher(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`World Bank ${ind.code}: HTTP ${res.status}`);
    const body = (await res.json()) as [unknown, WbRow[] | null];
    const rows: Record<string, [number, number]> = {};
    for (const r of body[1] ?? []) {
      const iso = r.countryiso3code;
      if (!iso || r.value === null || !Number.isFinite(r.value)) continue;
      rows[iso] = [Number(r.value), Number(r.date)];
    }
    indicators[ind.code] = Object.fromEntries(
      Object.entries(rows).sort(([a], [b]) => a.localeCompare(b)),
    );
  }
  return { retrieved_on: retrievedOn, endpoint: ENDPOINT, indicators };
}

export const wbSnapshotBytes = (s: WbSnapshot): string => `${stableStringify(s)}\n`;
