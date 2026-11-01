import { stableStringify, USER_AGENT } from "./util.ts";
import type { WdSnapshot } from "./wikidata.ts";

/** Official languages per country (Wikidata P37, CC0), for the Deep Cut language prompts. */
export type LanguagesSnapshot = {
  retrieved_on: string;
  endpoint: string;
  /** ISO3 -> English labels of the languages with official status today (no end date). */
  languages: Record<string, string[]>;
};

type Fetcher = (
  url: string,
  init?: { headers: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const ENDPOINT = "https://query.wikidata.org/sparql";

export function languagesQuery(qids: readonly string[]): string {
  const values = qids.map((q) => `wd:${q}`).join(" ");
  return `SELECT ?item ?langLabel WHERE {
  VALUES ?item { ${values} }
  ?item p:P37 ?st . ?st ps:P37 ?lang .
  FILTER NOT EXISTS { ?st pq:P582 [] }
  ?lang rdfs:label ?langLabel . FILTER(LANG(?langLabel) = "en")
}
ORDER BY ?item ?langLabel`;
}

export async function fetchLanguages(
  snapshot: WdSnapshot,
  retrievedOn: string,
  fetcher: Fetcher,
): Promise<LanguagesSnapshot> {
  const byQid = new Map(snapshot.countries.map((c) => [c.qid, c.code]));
  const languages: Record<string, Set<string>> = {};
  const qids = [...byQid.keys()].sort();
  for (let i = 0; i < qids.length; i += 60) {
    const url = `${ENDPOINT}?format=json&query=${encodeURIComponent(languagesQuery(qids.slice(i, i + 60)))}`;
    let res = await fetcher(url, {
      headers: { Accept: "application/sparql-results+json", "User-Agent": USER_AGENT },
    });
    // The public endpoint rate-limits bursts: wait and try again a few times.
    for (let wait = 1; !res.ok && res.status === 429 && wait <= 5; wait++) {
      await new Promise((r) => setTimeout(r, 15_000 * wait));
      res = await fetcher(url, {
        headers: { Accept: "application/sparql-results+json", "User-Agent": USER_AGENT },
      });
    }
    if (!res.ok) throw new Error(`Wikidata SPARQL failed with HTTP ${res.status}`);
    const json = (await res.json()) as {
      results: { bindings: Record<string, { value: string }>[] };
    };
    for (const b of json.results.bindings) {
      const code = byQid.get(b["item"]?.value.split("/").pop() ?? "");
      const label = b["langLabel"]?.value;
      if (code && label) (languages[code] ??= new Set()).add(label);
    }
  }
  return {
    retrieved_on: retrievedOn,
    endpoint: ENDPOINT,
    languages: Object.fromEntries(
      Object.entries(languages)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, [...v].sort()]),
    ),
  };
}

export const languagesBytes = (s: LanguagesSnapshot): string => `${stableStringify(s)}\n`;
