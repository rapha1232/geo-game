import type { Entity } from "@meridian/schemas";
import { norm } from "@meridian/name-matcher";
import { stableStringify, USER_AGENT } from "./util.ts";
import type { WdSnapshot } from "./wikidata.ts";

/** Answer languages offered in R2 (quiz-library §3). Labels come from Wikidata (CC0). */
export const ANSWER_LANGUAGES = ["es", "fr", "de", "pt", "it", "nl"] as const;

export type TranslationsSnapshot = {
  retrieved_on: string;
  endpoint: string;
  languages: readonly string[];
  /** ISO3 -> language -> label. */
  labels: Record<string, Record<string, string>>;
};

type Fetcher = (
  url: string,
  init?: { headers: Record<string, string> },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const ENDPOINT = "https://query.wikidata.org/sparql";

/** One label per item and language, for the exact items the names snapshot already resolved. */
export function translationsQuery(qids: readonly string[]): string {
  const values = qids.map((q) => `wd:${q}`).join(" ");
  const langs = ANSWER_LANGUAGES.map((l) => `"${l}"`).join(", ");
  return `SELECT ?item ?label WHERE {
  VALUES ?item { ${values} }
  ?item rdfs:label ?label . FILTER(LANG(?label) IN (${langs}))
}
ORDER BY ?item`;
}

export async function fetchTranslations(
  snapshot: WdSnapshot,
  retrievedOn: string,
  fetcher: Fetcher,
): Promise<TranslationsSnapshot> {
  const byQid = new Map(snapshot.countries.map((c) => [c.qid, c.code]));
  const labels: TranslationsSnapshot["labels"] = {};
  const qids = [...byQid.keys()].sort();
  // Chunks keep each request small enough for the public endpoint.
  for (let i = 0; i < qids.length; i += 60) {
    const chunk = qids.slice(i, i + 60);
    const url = `${ENDPOINT}?format=json&query=${encodeURIComponent(translationsQuery(chunk))}`;
    const res = await fetcher(url, {
      headers: { Accept: "application/sparql-results+json", "User-Agent": USER_AGENT },
    });
    if (!res.ok) throw new Error(`Wikidata SPARQL failed with HTTP ${res.status}`);
    const json = (await res.json()) as {
      results: { bindings: Record<string, { value: string; "xml:lang"?: string }>[] };
    };
    for (const b of json.results.bindings) {
      const qid = b["item"]?.value.split("/").pop() ?? "";
      const code = byQid.get(qid);
      const label = b["label"]?.value;
      const lang = b["label"]?.["xml:lang"];
      if (code && label && lang) (labels[code] ??= {})[lang] = label;
    }
  }
  const sorted = Object.fromEntries(
    Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [
        k,
        Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))),
      ]),
  );
  return {
    retrieved_on: retrievedOn,
    endpoint: ENDPOINT,
    languages: ANSWER_LANGUAGES,
    labels: sorted,
  };
}

export const translationsBytes = (s: TranslationsSnapshot): string => `${stableStringify(s)}\n`;

export type TranslationReport = { added: number; skippedSame: number; skippedCollision: string[] };

/**
 * Adds `translation` aliases (kind, `lang`) to each entity. A label is skipped when it only repeats a name the entity
 * already has, and also when it would make a second entity answerable: it matches another entity's English name or
 * alias, or another entity's label in the same language. Those cases would turn a right answer for one country into a
 * wrong one for another, so they are left out and listed in the report. Deterministic.
 */
export function addTranslations(
  entities: readonly Entity[],
  snapshot: TranslationsSnapshot,
): { entities: Entity[]; report: TranslationReport } {
  const english = new Map<string, Set<string>>();
  for (const e of entities)
    for (const t of [
      e.names.canonical,
      ...e.names.aliases.filter((a) => a.kind !== "translation").map((a) => a.text),
    ]) {
      const k = norm(t);
      if (k) (english.get(k) ?? english.set(k, new Set()).get(k)!).add(e.id);
    }
  const perLang = new Map<string, Set<string>>();
  for (const e of entities) {
    const code = e.id.slice(e.id.indexOf(":") + 1);
    for (const [lang, label] of Object.entries(snapshot.labels[code] ?? {})) {
      const k = `${lang}|${norm(label)}`;
      (perLang.get(k) ?? perLang.set(k, new Set()).get(k)!).add(e.id);
    }
  }
  const report: TranslationReport = { added: 0, skippedSame: 0, skippedCollision: [] };
  const out = entities.map((e) => {
    const code = e.id.slice(e.id.indexOf(":") + 1);
    const mine = new Set([e.names.canonical, ...e.names.aliases.map((a) => a.text)].map(norm));
    const add: Entity["names"]["aliases"] = [];
    for (const lang of snapshot.languages) {
      const label = snapshot.labels[code]?.[lang];
      if (!label) continue;
      const k = norm(label);
      if (!k || mine.has(k)) {
        report.skippedSame++;
        continue;
      }
      const other = [...(english.get(k) ?? [])].some((id) => id !== e.id);
      const clash = [...(perLang.get(`${lang}|${k}`) ?? [])].some((id) => id !== e.id);
      if (other || clash) {
        report.skippedCollision.push(`${e.id} ${lang} "${label}"`);
        continue;
      }
      mine.add(k);
      add.push({ text: label, kind: "translation", lang });
      report.added++;
    }
    return add.length === 0
      ? e
      : { ...e, names: { ...e.names, aliases: [...e.names.aliases, ...add] } };
  });
  return { entities: out, report };
}
