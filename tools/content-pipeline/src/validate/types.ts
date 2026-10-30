import type {
  AdjacencyEdge,
  AmbiguityGroup,
  DailySchedule,
  Dispute,
  Entity,
  Fact,
  SourceRegistry,
} from "@meridian/schemas";
import type { PolygonCoords } from "../geometry.ts";

/** Rule codes from DATA_AND_CONTENT §10. */
export type RuleCode =
  | "ID_FORMAT"
  | "ID_REUSED"
  | "NAME_MISSING"
  | "ALIAS_COLLISION"
  | "GEOM_INVALID"
  | "GEOM_MISSING"
  | "REF_POINT_OUTSIDE"
  | "ADJ_ASYMMETRIC"
  | "CAPITAL_OUTSIDE"
  | "DISPUTE_INVALID"
  | "FLAG_MISSING"
  | "SET_COUNT"
  | "FACT_NAMES_TARGET"
  | "FACT_NO_SOURCE"
  | "FACT_REVIEW_OVERDUE"
  | "LICENSE_UNVERIFIED"
  | "DAILY_REPEAT"
  | "QUOTA"
  | "DETERMINISM";

export type Issue = { code: RuleCode; level: "error" | "warn"; message: string; ref?: string };

export type Scale = "110m" | "50m" | "10m";

/** Decoded country geometry for one scale: entity id → its polygons. */
export type GeometryByScale = Record<Scale, Map<string, PolygonCoords[]>>;

/** A geometry defect in the upstream data that has been looked at and accepted (content/overrides/known-geometry-issues.yaml). */
export type KnownGeometryIssue = { entity: string; scale: Scale; problem: string; reason: string };

/** A capital that lies just outside the generalised 1:10m outline and has been checked by hand (content/overrides/known-capital-issues.yaml). */
export type KnownCapitalIssue = { entity: string; capital: string; reason: string };

export type CapitalPoint = { entityId: string; name: string; lat: number; lon: number };

/** Everything the validator looks at. Missing parts are simply not checked. */
export type ContentSet = {
  /** `YYYY-MM-DD`, injected so results do not depend on the clock. */
  today: string;
  entities: readonly Entity[];
  /** True for packs still marked draft: naming rules report warnings instead of errors until T1.1 reviews them. */
  draft?: boolean;
  /** Validate set sizes (197 and 193). Off for partial fixtures. */
  fullSets?: boolean;
  ambiguity?: readonly AmbiguityGroup[];
  disputes?: readonly Dispute[];
  geometry?: GeometryByScale;
  /** Upstream defects to report as warnings, each with a reason. Anything not listed is still an error. */
  knownGeometryIssues?: readonly KnownGeometryIssue[];
  knownCapitalIssues?: readonly KnownCapitalIssue[];
  /** Entity ids that have an SVG in the flags pack. Absent when the build has no flags. */
  flagIds?: ReadonlySet<string>;
  adjacency?: readonly AdjacencyEdge[];
  capitals?: readonly CapitalPoint[];
  facts?: readonly Fact[];
  /** Apply the balance quotas (DATA_AND_CONTENT §8.3). Off until the fact bank exists. */
  quotas?: boolean;
  daily?: readonly DailySchedule[];
  retiredIds?: ReadonlySet<string>;
  registry?: SourceRegistry;
  /** Source ids used by the packs of this release. */
  usedSources?: readonly string[];
  /** Release builds also enforce LICENSE_UNVERIFIED. */
  release?: boolean;
};
