import {
  CONTINENT_NAMES,
  countryPool,
  generateQuiz,
  timeLimitMs,
  type Format,
  type QuizConfig,
  type QuizWorld,
  type Scope,
  type Template,
} from "@meridian/quiz";

export type Category = "countries" | "capitals" | "flags" | "regions";

export type NamedQuiz = {
  slug: string;
  title: string;
  category: Category;
  template: Template;
  scope: Scope;
  format: Format;
  /** `all` or the random subset size. */
  count: "all" | number;
};

const CONTINENTS: [string, string, string][] = [
  ["africa", "AF", "Africa"],
  ["asia", "AS", "Asia"],
  ["europe", "EU", "Europe"],
  ["north-america", "NA", "North America"],
  ["south-america", "SA", "South America"],
  ["oceania", "OC", "Oceania"],
];
const SCOPES: { slug: string; scope: Scope; label: string }[] = [
  { slug: "world", scope: { kind: "world" }, label: "the World" },
  ...CONTINENTS.map(([slug, id, label]) => ({
    slug,
    scope: { kind: "continent", id } as Scope,
    label,
  })),
];

/** The R1 named quizzes (quiz-library §4.3). */
export const LIBRARY: readonly NamedQuiz[] = [
  {
    slug: "countries-of-the-world",
    title: "Countries of the World",
    category: "countries",
    template: "countries.by-name",
    scope: { kind: "world" },
    format: "TYPE_ALL",
    count: "all",
  },
  ...CONTINENTS.map(([slug, id, label]): NamedQuiz => ({
    slug: `countries-of-${slug}`,
    title: `Countries of ${label}`,
    category: "countries",
    template: "countries.by-name",
    scope: { kind: "continent", id },
    format: "TYPE_ALL",
    count: "all",
  })),
  ...SCOPES.map((s): NamedQuiz => ({
    slug: `find-countries-${s.slug}`,
    title: s.slug === "world" ? "Find the Country (World)" : `Find the Country (${s.label})`,
    category: "countries",
    template: "countries.by-name",
    scope: s.scope,
    format: "MAP_CLICK",
    count: s.slug === "world" ? 20 : "all",
  })),
  ...SCOPES.map((s): NamedQuiz => ({
    slug: `capitals-of-${s.slug}`,
    title: `Capitals of ${s.label}`,
    category: "capitals",
    template: "capitals.by-country",
    scope: s.scope,
    format: "TYPE_PROMPTED",
    count: "all",
  })),
  {
    slug: "capital-to-country-world",
    title: "Capital to Country",
    category: "capitals",
    template: "countries.by-capital",
    scope: { kind: "world" },
    format: "MULTIPLE_CHOICE",
    count: 20,
  },
  ...SCOPES.map((s): NamedQuiz => ({
    slug: `flags-of-${s.slug}`,
    title: `Flags of ${s.label}`,
    category: "flags",
    template: "flags.by-country",
    scope: s.scope,
    format: "TYPE_PROMPTED",
    count: "all",
  })),
  {
    slug: "flags-multiple-choice",
    title: "Flags (Multiple Choice)",
    category: "flags",
    template: "flags.by-country",
    scope: { kind: "world" },
    format: "MULTIPLE_CHOICE",
    count: 20,
  },
  {
    slug: "continents-map",
    title: "Continents on the Map",
    category: "regions",
    template: "continents.by-name",
    scope: { kind: "world" },
    format: "MAP_CLICK",
    count: "all",
  },
  {
    slug: "world-regions-map",
    title: "World Regions on the Map",
    category: "regions",
    template: "regions.by-name",
    scope: { kind: "world" },
    format: "MAP_CLICK",
    count: "all",
  },
];

export const findQuiz = (slug: string): NamedQuiz | undefined =>
  LIBRARY.find((q) => q.slug === slug);

export const FORMAT_LABEL: Record<Format, string> = {
  TYPE_ALL: "Type all",
  TYPE_PROMPTED: "Identify",
  MAP_CLICK: "Map",
  MULTIPLE_CHOICE: "Choice",
};

/** The default configuration of a named quiz. */
export function defaultConfig(q: NamedQuiz): QuizConfig {
  return {
    template: q.template,
    scope: q.scope,
    format: q.format,
    countrySet: "sovereign-197",
    count: q.count,
    order: "random",
    timed: true,
    difficulty: "normal",
    strictness: "standard",
  };
}

/** Items in the quiz for a configuration: the live count the configure panel shows (§3). */
export function itemCount(world: QuizWorld, c: QuizConfig): number {
  if (c.template === "continents.by-name")
    return world.groups.filter((g) => g.kind === "continent").length;
  if (c.template === "regions.by-name")
    return world.groups.filter((g) => g.kind === "region").length;
  const n = countryPool(world, c.countrySet, c.scope).filter(
    (e) =>
      !(c.template === "capitals.by-country" || c.template === "countries.by-capital") ||
      e.capitals.length > 0,
  ).length;
  return c.count === "all" ? n : Math.min(c.count, n);
}

/** `m:ss` for a time limit. */
export const formatClock = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export const limitLabel = (world: QuizWorld, c: QuizConfig): string =>
  formatClock(timeLimitMs(c.format, itemCount(world, c)));

export type LibraryFilter = {
  search: string;
  category: Category | "";
  format: Format | "";
  maxMinutes: number | null;
};

export function filterLibrary(world: QuizWorld, filter: LibraryFilter): NamedQuiz[] {
  const q = filter.search.trim().toLowerCase();
  return LIBRARY.filter((n) => {
    if (q && !n.title.toLowerCase().includes(q) && !n.slug.includes(q)) return false;
    if (filter.category && n.category !== filter.category) return false;
    if (filter.format && n.format !== filter.format) return false;
    if (
      filter.maxMinutes !== null &&
      timeLimitMs(n.format, itemCount(world, defaultConfig(n))) > filter.maxMinutes * 60_000
    )
      return false;
    return true;
  });
}

export const scopeSlugLabel = (id: string): string => CONTINENT_NAMES[id] ?? id;
export { generateQuiz };
