/** The countries with a subdivision pack. Kept in step with `tools/content-pipeline/src/subdivisions.ts` (the pipeline checks the counts). */
export type SubCountry = { code: string; name: string; kind: string; count: number };

export const SUB_COUNTRIES: readonly SubCountry[] = [
  { code: "ARG", name: "Argentina", kind: "province", count: 24 },
  { code: "AUS", name: "Australia", kind: "state or territory", count: 8 },
  { code: "BRA", name: "Brazil", kind: "state", count: 27 },
  { code: "CAN", name: "Canada", kind: "province or territory", count: 13 },
  { code: "CHL", name: "Chile", kind: "region", count: 16 },
  { code: "DEU", name: "Germany", kind: "state", count: 16 },
  { code: "IDN", name: "Indonesia", kind: "province", count: 33 },
  { code: "JPN", name: "Japan", kind: "prefecture", count: 47 },
  { code: "KOR", name: "South Korea", kind: "province", count: 17 },
  { code: "NGA", name: "Nigeria", kind: "state", count: 37 },
  { code: "USA", name: "United States", kind: "state", count: 51 },
  { code: "ZAF", name: "South Africa", kind: "province", count: 9 },
];

export const findSubCountry = (code: string): SubCountry | undefined =>
  SUB_COUNTRIES.find((c) => c.code === code.toUpperCase());

/** "state or territory" becomes "states and territories". */
export const pluralKind = (kind: string): string => {
  const plural = (w: string): string => (w.endsWith("y") ? `${w.slice(0, -1)}ies` : `${w}s`);
  return kind.includes(" or ") ? kind.split(" or ").map(plural).join(" and ") : plural(kind);
};

export const subTitle = (c: SubCountry): string => {
  const p = pluralKind(c.kind);
  return `${c.name}: ${p[0]!.toUpperCase()}${p.slice(1)}`;
};
export const subSlug = (c: SubCountry): string => `subdivisions-${c.code.toLowerCase()}`;
