import countries from "./generated/countries.json";

/** The default set (sovereign-197) with canonical English names, for server code that has no content pack. */
export const COUNTRIES: readonly { code: string; name: string }[] = countries;

const byCode = new Map(COUNTRIES.map((c) => [c.code, c.name]));

/** The canonical name of a sovereign-197 member, by ISO 3166-1 alpha-3 code. */
export const countryName = (code: string): string | undefined => byCode.get(code);
