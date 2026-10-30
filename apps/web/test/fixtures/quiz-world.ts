import { buildQuizWorld, type QuizEntity, type Skill } from "@meridian/quiz";
import type { QuizFacts } from "../../lib/quiz/data";

const mk = (
  code: string,
  name: string,
  continent: string,
  region: string,
  capital: string | string[],
  extra: Partial<QuizEntity> = {},
): QuizEntity => ({
  id: `country:${code}`,
  name,
  aliases: [],
  type: "country",
  continent,
  region: { id: region, name: region },
  areaKm2: 100_000,
  capitals: (Array.isArray(capital) ? capital : [capital]).map((c, i) => ({
    name: c,
    role: i === 0 ? "official" : "seat_of_government",
  })),
  difficulty: { recall: 0.5, locate: 0.5, flag: 0.5, capital: 0.5 } as Partial<
    Record<Skill, number>
  >,
  sets: ["sovereign-197", "un-193"],
  ...extra,
});

export const entities: QuizEntity[] = [
  mk("PRY", "Paraguay", "SA", "south-america", "Asunción"),
  mk("BRA", "Brazil", "SA", "south-america", "Brasília"),
  mk("ARG", "Argentina", "SA", "south-america", "Buenos Aires"),
  mk("BOL", "Bolivia", "SA", "south-america", ["Sucre", "La Paz"]),
  mk("URY", "Uruguay", "SA", "south-america", "Montevideo"),
  mk("NER", "Niger", "AF", "western-africa", "Niamey"),
  mk("NGA", "Nigeria", "AF", "western-africa", "Abuja"),
  mk("TCD", "Chad", "AF", "middle-africa", "N'Djamena", { confusables: ["country:ROU"] }),
  mk("FRA", "France", "EU", "western-europe", "Paris"),
  mk("ROU", "Romania", "EU", "eastern-europe", "Bucharest"),
  mk("TUV", "Tuvalu", "OC", "polynesia", "Funafuti", { areaKm2: 26 }),
  mk("NRU", "Nauru", "OC", "micronesia", "Yaren", { areaKm2: 21 }),
  mk("MMR", "Myanmar", "AS", "south-eastern-asia", "Naypyidaw", {
    aliases: [{ text: "Burma", kind: "former" }],
  }),
  mk("KGZ", "Kyrgyzstan", "AS", "central-asia", "Bishkek"),
];
export const world = buildQuizWorld(entities);
export const edges = [
  { a: "country:ARG", b: "country:BOL" },
  { a: "country:ARG", b: "country:BRA" },
  { a: "country:ARG", b: "country:PRY" },
  { a: "country:ARG", b: "country:URY" },
  { a: "country:BOL", b: "country:BRA" },
  { a: "country:BOL", b: "country:PRY" },
  { a: "country:BRA", b: "country:PRY" },
  { a: "country:BRA", b: "country:URY" },
];
const nb = new Map<string, Set<string>>();
for (const { a, b } of edges) {
  (nb.get(a) ?? nb.set(a, new Set()).get(a)!).add(b);
  (nb.get(b) ?? nb.set(b, new Set()).get(b)!).add(a);
}
export const neighbors: ReadonlyMap<string, ReadonlySet<string>> = nb;
export const facts: QuizFacts = {
  landlocked: new Set(["country:PRY", "country:BOL", "country:TCD", "country:NER", "country:KGZ"]),
  labelPoints: new Map(entities.map((e) => [e.id, [0, 0] as const])),
};
