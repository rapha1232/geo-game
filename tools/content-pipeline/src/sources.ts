const NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson";

export type SourceDef = { id: string; source: string; url: string; version: string; file: string };

/** Everything the pipeline downloads. Raw files go to data/raw/<file> (gitignored) and are verified against the lock. */
export const SOURCES: SourceDef[] = [
  {
    id: "ne-110m-countries",
    source: "ne",
    url: `${NE}/ne_110m_admin_0_countries.geojson`,
    version: "v5.1.2",
    file: "ne/ne_110m_admin_0_countries.geojson",
  },
  {
    id: "ne-50m-countries",
    source: "ne",
    url: `${NE}/ne_50m_admin_0_countries.geojson`,
    version: "v5.1.2",
    file: "ne/ne_50m_admin_0_countries.geojson",
  },
  {
    id: "ne-10m-countries",
    source: "ne",
    url: `${NE}/ne_10m_admin_0_countries.geojson`,
    version: "v5.1.2",
    file: "ne/ne_10m_admin_0_countries.geojson",
  },
  {
    id: "ne-10m-populated-places",
    source: "ne",
    url: `${NE}/ne_10m_populated_places_simple.geojson`,
    version: "v5.1.2",
    file: "ne/ne_10m_populated_places_simple.geojson",
  },
  {
    id: "flag-icons",
    source: "fi",
    url: "https://registry.npmjs.org/flag-icons/-/flag-icons-7.6.0.tgz",
    version: "7.6.0",
    file: "fi/flag-icons-7.6.0.tgz",
  },
];

/** The Wikidata snapshot is committed (it is a point-in-time query result), but it is pinned in the lock like the rest. */
export const WIKIDATA_SNAPSHOT = {
  id: "wikidata-countries",
  source: "wd",
  file: "data/snapshots/wikidata-countries.json",
  version: "snapshot",
};
