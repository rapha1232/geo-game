/** Atlas layers (atlas-explorer §3). Indicator layers read the `core.indicators` pack; the rest come from the countries. */
export type LayerId =
  | "political"
  | "population"
  | "area"
  | "density"
  | "gdp-per-capita"
  | "life-expectancy"
  | "capital-latitude"
  | "landlocked";

export type Layer =
  | { id: "political" | "landlocked"; kind: "category"; label: string }
  | {
      id: Exclude<LayerId, "political" | "landlocked">;
      kind: "indicator";
      label: string;
      scheme: "quantile" | "log";
    };

export const LAYERS: readonly Layer[] = [
  { id: "political", kind: "category", label: "Countries" },
  { id: "population", kind: "indicator", label: "Population", scheme: "log" },
  { id: "area", kind: "indicator", label: "Area", scheme: "log" },
  { id: "density", kind: "indicator", label: "Population density", scheme: "quantile" },
  { id: "gdp-per-capita", kind: "indicator", label: "GDP per capita", scheme: "quantile" },
  { id: "life-expectancy", kind: "indicator", label: "Life expectancy", scheme: "quantile" },
  { id: "capital-latitude", kind: "indicator", label: "Capital latitude", scheme: "quantile" },
  { id: "landlocked", kind: "category", label: "Landlocked" },
];

export const DEFAULT_LAYER: LayerId = "political";
export const layerById = (id: string): Layer | undefined => LAYERS.find((l) => l.id === id);
export const isLayerId = (id: string): id is LayerId => layerById(id) !== undefined;
export const CLASSES = 5;
