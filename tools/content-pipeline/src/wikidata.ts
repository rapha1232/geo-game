import { stableStringify, USER_AGENT } from "./util.ts";

/** Wikidata labels Kosovo "XKS". Meridian's id is XKX (DATA_MODEL "Stable identifiers"). */
export const WD_CODE_FIXES: Record<string, string> = { XKS: "XKX" };
const toWdCode = (code: string): string =>
  Object.entries(WD_CODE_FIXES).find(([, mine]) => mine === code)?.[0] ?? code;

/**
 * Editorial picks where Wikidata has two items with the same ISO code. Every other duplicate fails the build.
 * PSE: Q219060 is the State of Palestine (the UN observer state in the sovereign-197 set); Q407199 is a different item that shares its code.
 */
export const WD_ITEM_PICKS: Record<string, string> = { PSE: "Q219060" };

export type WdCountry = {
  code: string;
  qid: string;
  label: string;
  /** English alternative labels ("also known as"). Noisy: editorial review happens in T1.1. */
  altLabels: string[];
  /** English official names (P1448). */
  officialNames: string[];
};

export type WdCapital = {
  code: string;
  qid: string;
  label: string;
  coord: [number, number] | null;
};

export type WdSnapshot = {
  retrieved_on: string;
  endpoint: string;
  queries: { names: string; capitals: string };
  countries: WdCountry[];
  /** Current capitals (P36 without an end date). Roles (official, seat of government…) are editorial (T1.1). */
  capitals: WdCapital[];
};

export function namesQuery(codes: readonly string[]): string {
  const values = codes.map((c) => `"${toWdCode(c)}"`).join(" ");
  return `SELECT ?item ?iso3 ?label (GROUP_CONCAT(DISTINCT ?alt; separator="|") AS ?alts) (GROUP_CONCAT(DISTINCT ?official; separator="|") AS ?officials) WHERE {
  VALUES ?iso3 { ${values} }
  ?item wdt:P298 ?iso3 .
  FILTER NOT EXISTS { ?item wdt:P576 [] }
  ?item rdfs:label ?label . FILTER(LANG(?label) = "en")
  OPTIONAL { ?item skos:altLabel ?alt . FILTER(LANG(?alt) = "en") }
  OPTIONAL { ?item wdt:P1448 ?official . FILTER(LANG(?official) = "en") }
}
GROUP BY ?item ?iso3 ?label
ORDER BY ?iso3 ?item`;
}

export function capitalsQuery(codes: readonly string[]): string {
  const values = codes.map((c) => `"${toWdCode(c)}"`).join(" ");
  return `SELECT ?iso3 ?cap ?capLabel ?coord WHERE {
  VALUES ?iso3 { ${values} }
  ?item wdt:P298 ?iso3 .
  FILTER NOT EXISTS { ?item wdt:P576 [] }
  ?item p:P36 ?statement . ?statement ps:P36 ?cap .
  FILTER NOT EXISTS { ?statement pq:P582 [] }
  ?cap rdfs:label ?capLabel . FILTER(LANG(?capLabel) = "en")
  OPTIONAL { ?cap wdt:P625 ?coord }
}
ORDER BY ?iso3 ?cap`;
}

type Binding = Record<string, { value: string } | undefined>;
type SparqlJson = { results: { bindings: Binding[] } };

const fromCode = (wd: string): string => WD_CODE_FIXES[wd] ?? wd;
const qidOf = (uri: string): string => uri.slice(uri.lastIndexOf("/") + 1);
const split = (s: string | undefined): string[] =>
  s ? [...new Set(s.split("|").filter(Boolean))].sort() : [];

/** "Point(lon lat)" → [lat, lon]. */
function parsePoint(wkt: string | undefined): [number, number] | null {
  const m = /^Point\(\s*(-?[\d.]+)\s+(-?[\d.]+)\s*\)$/.exec(wkt ?? "");
  return m ? [Number(m[2]), Number(m[1])] : null;
}

export function parseCountries(
  json: SparqlJson,
  picks: Record<string, string> = WD_ITEM_PICKS,
): WdCountry[] {
  const byCode = new Map<string, WdCountry[]>();
  for (const b of json.results.bindings) {
    const wd = b["iso3"]?.value;
    const item = b["item"]?.value;
    const label = b["label"]?.value;
    if (!wd || !item || !label) continue;
    const code = fromCode(wd);
    const list = byCode.get(code) ?? [];
    list.push({
      code,
      qid: qidOf(item),
      label,
      altLabels: split(b["alts"]?.value),
      officialNames: split(b["officials"]?.value),
    });
    byCode.set(code, list);
  }
  const out: WdCountry[] = [];
  for (const [code, list] of byCode) {
    if (list.length === 1) {
      out.push(list[0] as WdCountry);
      continue;
    }
    const pick = list.find((c) => c.qid === picks[code]);
    if (!pick)
      throw new Error(
        `Wikidata returned ${list.length} items for ${code} (${list.map((c) => c.qid).join(", ")}). Add an editorial pick to WD_ITEM_PICKS.`,
      );
    out.push(pick);
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}

export function parseCapitals(json: SparqlJson): WdCapital[] {
  const out: WdCapital[] = [];
  for (const b of json.results.bindings) {
    const wd = b["iso3"]?.value;
    const cap = b["cap"]?.value;
    const label = b["capLabel"]?.value;
    if (!wd || !cap || !label) continue;
    out.push({ code: fromCode(wd), qid: qidOf(cap), label, coord: parsePoint(b["coord"]?.value) });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code) || a.qid.localeCompare(b.qid));
}

export type Fetcher = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

const ENDPOINT = "https://query.wikidata.org/sparql";

async function sparql(query: string, fetcher: Fetcher): Promise<SparqlJson> {
  const url = `${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`;
  const res = await fetcher(url, {
    headers: { Accept: "application/sparql-results+json", "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`Wikidata SPARQL failed with HTTP ${res.status}`);
  return (await res.json()) as SparqlJson;
}

/** Runs both queries and returns a snapshot. The snapshot is committed, so builds do not depend on Wikidata's current state. */
export async function fetchWikidataSnapshot(
  codes: readonly string[],
  retrievedOn: string,
  fetcher: Fetcher,
): Promise<WdSnapshot> {
  const names = namesQuery(codes);
  const capitals = capitalsQuery(codes);
  const [n, c] = [await sparql(names, fetcher), await sparql(capitals, fetcher)];
  return {
    retrieved_on: retrievedOn,
    endpoint: ENDPOINT,
    queries: { names, capitals },
    countries: parseCountries(n),
    capitals: parseCapitals(c),
  };
}

export const snapshotBytes = (s: WdSnapshot): string => `${stableStringify(s)}\n`;
