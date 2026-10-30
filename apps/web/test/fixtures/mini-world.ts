import { buildWorld, type SilEntity } from "@meridian/silhouette";

const mk = (
  id: string,
  name: string,
  ref: [number, number],
  extra: Partial<SilEntity> = {},
): SilEntity => ({
  id: `country:${id}`,
  name,
  aliases: [],
  type: "country",
  continent: "EU",
  areaKm2: 100_000,
  ref,
  shape: 0.3,
  sets: ["sovereign-197", "un-193"],
  capitals: [`${name} City`],
  remote: [],
  ...extra,
});

export const entities = [
  mk("RUS", "Russia", [60, 90], { areaKm2: 17_000_000 }),
  mk("KAZ", "Kazakhstan", [48, 67], { continent: "AS" }),
  mk("GRC", "Greece", [39, 22]),
  mk("GRD", "Grenada", [12.1, -61.7], { continent: "NA", areaKm2: 344 }),
  mk("FRA", "France", [46.6, 2.5]),
  mk("ESP", "Spain", [40.2, -3.6]),
  mk("ITA", "Italy", [42, 12.5]),
  mk("DEU", "Germany", [51, 10]),
];
export const world = buildWorld(entities, [{ a: "country:KAZ", b: "country:RUS" }]);
