import { buildWorld, type SilEntity, type World } from "../src";

export const mk = (
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
  shape: 0.5,
  sets: ["sovereign-197", "un-193"],
  capitals: [`${name} City`],
  remote: [],
  ...extra,
});

export const FRA = mk("FRA", "France", [46.6, 2.5], {
  areaKm2: 640_679,
  capitals: ["Paris"],
  remote: [{ ref: [4, -53], areaKm2: 83_930 }],
});
export const ESP = mk("ESP", "Spain", [40.2, -3.6], { areaKm2: 505_000, capitals: ["Madrid"] });
export const BRA = mk("BRA", "Brazil", [-14, -52], {
  continent: "SA",
  areaKm2: 8_500_000,
  capitals: ["Brasília"],
});
export const FJI = mk("FJI", "Fiji", [-17.8, 178], {
  continent: "OC",
  areaKm2: 18_000,
  capitals: ["Suva"],
});
export const WSM = mk("WSM", "Samoa", [-13.8, -172.1], {
  continent: "OC",
  areaKm2: 2_800,
  capitals: ["Apia"],
});
export const RUS = mk("RUS", "Russia", [60, 90], {
  continent: "EU",
  areaKm2: 17_000_000,
  capitals: ["Moscow"],
});
export const KAZ = mk("KAZ", "Kazakhstan", [48, 67], {
  continent: "AS",
  areaKm2: 2_700_000,
  capitals: ["Astana"],
});
export const COD = mk("COD", "DR Congo", [-3, 23], {
  continent: "AF",
  aliases: [{ text: "Congo", kind: "common" }],
});
export const COG = mk("COG", "Republic of the Congo", [-1, 15], {
  continent: "AF",
  aliases: [{ text: "Congo", kind: "common" }],
});
export const GRC = mk("GRC", "Greece", [39, 22]);
export const GRD = mk("GRD", "Grenada", [12.1, -61.7], { continent: "NA", areaKm2: 344 });
export const GRL = mk("GRL", "Greenland", [74, -40], {
  id: "territory:GRL",
  type: "territory",
  continent: "NA",
  areaKm2: 2_166_000,
  sets: [],
});
export const PHL = mk("PHL", "Philippines", [12, 122], { continent: "AS" });
export const A1 = mk("AAA", "Antipode A", [0, 0]);
export const A2 = mk("BBB", "Antipode B", [0, 180]);

export const baseEntities = [
  FRA,
  ESP,
  BRA,
  FJI,
  WSM,
  RUS,
  KAZ,
  COD,
  COG,
  GRC,
  GRD,
  GRL,
  PHL,
  A1,
  A2,
];
export const baseWorld = (): World =>
  buildWorld(
    baseEntities,
    [{ a: RUS.id, b: KAZ.id }],
    [
      {
        group: "congo",
        alias: "Congo",
        members: [COD.id, COG.id],
        message: 'Which Congo? Try "Republic of the Congo" or "DR Congo".',
      },
    ],
  );

/** A synthetic world of 197 sovereign entities across the continents, with some small ones. */
export function bigWorld(): World {
  const continents = ["AF", "AS", "EU", "NA", "OC", "SA"];
  const entities = Array.from({ length: 197 }, (_, i) => {
    const code = `${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + (Math.floor(i / 26) % 26))}${String.fromCharCode(65 + Math.floor(i / 676))}`;
    return mk(code, `Land ${code}`, [((i * 7) % 140) - 70, ((i * 37) % 340) - 170], {
      continent: continents[i % 6] as string,
      areaKm2: i % 6 === 0 ? 1000 + i : 50_000 + i * 1000,
      shape: (i % 20) / 20,
    });
  });
  return buildWorld(entities, []);
}
