import {
  buildQuizWorld,
  type QuizConfig,
  type QuizEntity,
  type QuizWorld,
  type Skill,
} from "../src";

const region = (id: string) => ({
  id,
  name: id.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()),
});

export const mk = (
  id: string,
  name: string,
  continent: string,
  extra: Partial<QuizEntity> & { regionId?: string; capital?: string | string[] } = {},
): QuizEntity => {
  const { regionId, capital, ...rest } = extra;
  const caps =
    capital === undefined ? [`${name} City`] : Array.isArray(capital) ? capital : [capital];
  return {
    id: `country:${id}`,
    name,
    aliases: [],
    type: "country",
    continent,
    region: regionId ? region(regionId) : null,
    areaKm2: 100_000,
    capitals: caps.map((c, i) => ({ name: c, role: i === 0 ? "official" : "seat_of_government" })),
    difficulty: { recall: 0.5, locate: 0.5, flag: 0.5, capital: 0.5 } as Partial<
      Record<Skill, number>
    >,
    sets: ["sovereign-197", "un-193"],
    ...rest,
  };
};

export const named = [
  mk("NER", "Niger", "AF", { regionId: "western-africa", capital: "Niamey" }),
  mk("NGA", "Nigeria", "AF", { regionId: "western-africa", capital: "Abuja" }),
  mk("COD", "DR Congo", "AF", {
    regionId: "middle-africa",
    capital: "Kinshasa",
    aliases: [
      { text: "Congo", kind: "common" },
      { text: "Zaire", kind: "former" },
    ],
  }),
  mk("COG", "Republic of the Congo", "AF", {
    regionId: "middle-africa",
    capital: "Brazzaville",
    aliases: [{ text: "Congo", kind: "common" }],
  }),
  mk("TCD", "Chad", "AF", {
    regionId: "middle-africa",
    capital: "N'Djamena",
    confusables: ["country:ROU"],
  }),
  mk("FRA", "France", "EU", { regionId: "western-europe", capital: "Paris", areaKm2: 640_000 }),
  mk("ROU", "Romania", "EU", { regionId: "eastern-europe", capital: "Bucharest" }),
  mk("BOL", "Bolivia", "SA", { regionId: "south-america", capital: ["Sucre", "La Paz"] }),
  mk("PRY", "Paraguay", "SA", {
    regionId: "south-america",
    capital: "Asunción",
    aliases: [{ text: "Paraguai", kind: "endonym" }],
  }),
  mk("URY", "Uruguay", "SA", { regionId: "south-america", capital: "Montevideo" }),
  mk("BRA", "Brazil", "SA", { regionId: "south-america", capital: "Brasília", areaKm2: 8_500_000 }),
  mk("TUV", "Tuvalu", "OC", { regionId: "polynesia", capital: "Funafuti", areaKm2: 26 }),
  mk("NRU", "Nauru", "OC", { regionId: "micronesia", capital: "Yaren", areaKm2: 21 }),
  mk("PLW", "Palau", "OC", { regionId: "micronesia", capital: "Ngerulmud", areaKm2: 459 }),
  mk("MMR", "Myanmar", "AS", {
    regionId: "south-eastern-asia",
    capital: "Naypyidaw",
    aliases: [{ text: "Burma", kind: "former" }],
  }),
  mk("KGZ", "Kyrgyzstan", "AS", { regionId: "central-asia", capital: "Bishkek" }),
  mk("GRL", "Greenland", "NA", {
    id: "territory:GRL",
    type: "territory",
    regionId: "northern-america",
    capital: "Nuuk",
    sets: [],
  }),
];

const CONTINENTS = ["AF", "AS", "EU", "NA", "OC", "SA"];
/** `n` synthetic countries spread over the continents and some regions. */
export const filler = (n: number, start = 0): QuizEntity[] =>
  Array.from({ length: n }, (_, i) => {
    const k = start + i;
    const code = `${String.fromCharCode(65 + (k % 26))}${String.fromCharCode(65 + (Math.floor(k / 26) % 26))}X`;
    return mk(code, `Land ${code}`, CONTINENTS[k % 6] as string, {
      regionId: `region-${k % 12}`,
      capital: `Cap ${code}`,
      areaKm2: 1000 + k * 5000,
      difficulty: {
        recall: (k % 10) / 10,
        locate: (k % 10) / 10,
        flag: (k % 10) / 10,
        capital: (k % 10) / 10,
      },
    });
  });

export const ambiguity = [
  {
    group: "congo",
    alias: "Congo",
    members: ["country:COD", "country:COG"],
    message: 'Which Congo? Try "Republic of the Congo" or "DR Congo".',
  },
];

export const smallWorld = (): QuizWorld => buildQuizWorld([...named, ...filler(20)], ambiguity);
export const bigWorld = (): QuizWorld =>
  buildQuizWorld([...named.slice(0, 16), ...filler(181)], ambiguity);

export const cfg = (over: Partial<QuizConfig> = {}): QuizConfig => ({
  template: "countries.by-name",
  scope: { kind: "world" },
  format: "TYPE_ALL",
  countrySet: "sovereign-197",
  count: "all",
  order: "random",
  timed: true,
  difficulty: "normal",
  strictness: "standard",
  ...over,
});
