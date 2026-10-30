import { norm } from "@meridian/name-matcher";
import { timeLimitMs, type Format, type QuizWorld } from "@meridian/quiz";
import { LIBRARY, defaultConfig, itemCount, type Category } from "../quiz/library";

export type Topic = Category | "mixed";
export type CatalogFormat = "Type" | "Map" | "Choice" | "Deduction";
export type LengthBucket = "short" | "medium" | "long" | "endless";
export type Region = "AF" | "AS" | "EU" | "NA" | "OC" | "SA";

export type CatalogItem = {
  /** `game:silhouette` or `quiz:<slug>`, also the favorites key. */
  key: string;
  kind: "game" | "quiz";
  title: string;
  pitch: string;
  href: string;
  topic: Topic;
  format: CatalogFormat;
  length: LengthBucket;
  region?: Region;
  /** Lowercase words the search matches besides the title: topic, format, and (with content) entity names. */
  tags: string[];
};

const FORMAT_OF: Record<Format, CatalogFormat> = {
  TYPE_ALL: "Type",
  TYPE_PROMPTED: "Type",
  MAP_CLICK: "Map",
  MULTIPLE_CHOICE: "Choice",
};

/** < 2 min, 2 to 5, 5 to 15 (UX_AND_DESIGN §3.2). Anything longer is "endless" in spirit but shown as 5–15. */
export const lengthOf = (ms: number): LengthBucket =>
  ms < 120_000 ? "short" : ms <= 300_000 ? "medium" : "long";

export const SILHOUETTE: CatalogItem = {
  key: "game:silhouette",
  kind: "game",
  title: "Silhouette",
  pitch: "Name the country from its outline. Six guesses, with distance and direction.",
  href: "/play/silhouette",
  topic: "countries",
  format: "Deduction",
  length: "endless",
  tags: ["countries", "shape", "outline", "deduction", "geography"],
};

/** Games and the named quizzes. With a loaded world, each quiz also matches the names of its countries and capitals. */
export function buildCatalog(world: QuizWorld | null): CatalogItem[] {
  const quizzes = LIBRARY.map((q): CatalogItem => {
    const c = defaultConfig(q);
    const ms = world
      ? timeLimitMs(q.format, itemCount(world, c))
      : q.count === "all"
        ? 300_000
        : 120_000;
    const names: string[] = [];
    if (world && q.template !== "continents.by-name" && q.template !== "regions.by-name") {
      for (const e of world.entities) {
        if (c.scope.kind === "continent" && e.continent !== c.scope.id) continue;
        names.push(e.name.toLowerCase());
        if (q.template.startsWith("capitals") || q.template === "countries.by-capital")
          for (const cap of e.capitals) names.push(cap.name.toLowerCase());
      }
    }
    return {
      key: `quiz:${q.slug}`,
      kind: "quiz",
      title: q.title,
      pitch: `${itemCountText(q.count, world ? itemCount(world, c) : null)} · ${FORMAT_OF[q.format]}`,
      href: `/play/quiz/${q.slug}`,
      topic: q.category,
      format: FORMAT_OF[q.format],
      length: lengthOf(ms),
      ...(q.scope.kind === "continent" ? { region: q.scope.id as Region } : {}),
      tags: [q.category, FORMAT_OF[q.format].toLowerCase(), "quiz", ...names],
    };
  });
  return [SILHOUETTE, ...quizzes];
}

const itemCountText = (count: "all" | number, n: number | null): string =>
  count === "all" ? (n === null ? "All items" : `${n} items`) : `${count} random`;

export type CatalogFilter = {
  search: string;
  topic: Topic | "";
  format: CatalogFormat | "";
  length: LengthBucket | "";
  region: Region | "";
  favoritesOnly: boolean;
};

export const EMPTY_FILTER: CatalogFilter = {
  search: "",
  topic: "",
  format: "",
  length: "",
  region: "",
  favoritesOnly: false,
};

export const isFiltered = (f: CatalogFilter): boolean =>
  f.search.trim() !== "" || !!f.topic || !!f.format || !!f.length || !!f.region || f.favoritesOnly;

/** Every query word must appear in the title or a tag (AND), ignoring case, accents and punctuation. */
function matchesSearch(item: CatalogItem, words: readonly string[]): boolean {
  if (words.length === 0) return true;
  const hay = [item.title, item.pitch, ...item.tags].map((s) => norm(s));
  return words.every((w) => hay.some((h) => h.includes(w)));
}

export type Sort = "recommended" | "az" | "recent";

export type CatalogState = {
  favorites: ReadonlySet<string>;
  /** Item key → ms of the last play. Unplayed items are absent. */
  played: ReadonlyMap<string, number>;
  /** Item keys with weak spots, from mastery. */
  weak?: ReadonlySet<string>;
};

/** Filters combine with AND; sorting is Recommended (unplayed, then weak spots, then the rest), A–Z, or recently played. */
export function searchCatalog(
  items: readonly CatalogItem[],
  f: CatalogFilter,
  state: CatalogState,
  sort: Sort = "recommended",
): CatalogItem[] {
  const words = f.search
    .split(/\s+/)
    .map((w) => norm(w))
    .filter(Boolean);
  const out = items.filter(
    (i) =>
      matchesSearch(i, words) &&
      (!f.topic || i.topic === f.topic) &&
      (!f.format || i.format === f.format) &&
      (!f.length || i.length === f.length) &&
      (!f.region || i.region === f.region) &&
      (!f.favoritesOnly || state.favorites.has(i.key)),
  );
  const rank = (i: CatalogItem): number =>
    !state.played.has(i.key) ? 0 : state.weak?.has(i.key) ? 1 : 2;
  const byTitle = (a: CatalogItem, b: CatalogItem): number => a.title.localeCompare(b.title);
  if (sort === "az") return out.sort(byTitle);
  if (sort === "recent")
    return out.sort(
      (a, b) => (state.played.get(b.key) ?? -1) - (state.played.get(a.key) ?? -1) || byTitle(a, b),
    );
  const order = new Map(items.map((i, n) => [i.key, n]));
  return out.sort((a, b) => rank(a) - rank(b) || (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0));
}

/** A random R1 game at Normal difficulty for "Play something now" (one click from Home, AC-PL-001). */
export function pickPlaySomething(
  items: readonly CatalogItem[],
  random: () => number,
): CatalogItem {
  const pool = items.filter(
    (i) =>
      i.kind === "game" ||
      i.key === "quiz:countries-of-the-world" ||
      i.key.startsWith("quiz:find-countries") ||
      i.key.startsWith("quiz:flags-"),
  );
  return pool[Math.floor(random() * pool.length)] ?? SILHOUETTE;
}

/** The six popular quiz tiles on Home. */
export const POPULAR = [
  "countries-of-the-world",
  "find-countries-world",
  "capitals-of-world",
  "flags-of-world",
  "flags-multiple-choice",
  "countries-of-europe",
] as const;
