import { z } from "zod";
import { entityId } from "./ids";

/**
 * A geometry pack is a TopoJSON Topology (DATA_MODEL §2.3). We validate the envelope and the properties we rely on;
 * topojson-client validates the arcs when it decodes them.
 */
export const geometryObject = z
  .object({
    type: z.enum(["GeometryCollection"]),
    geometries: z.array(
      z
        .object({
          type: z.enum([
            "Polygon",
            "MultiPolygon",
            "Point",
            "LineString",
            "MultiLineString",
            "GeometryCollection",
          ]),
          id: entityId,
          properties: z
            .object({ parts: z.enum(["main", "remote"]).optional() })
            .passthrough()
            .optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export const topology = z
  .object({
    type: z.literal("Topology"),
    objects: z.record(z.string(), geometryObject),
    arcs: z.array(z.array(z.array(z.number()))),
    transform: z
      .object({
        scale: z.tuple([z.number(), z.number()]),
        translate: z.tuple([z.number(), z.number()]),
      })
      .optional(),
  })
  .passthrough();
export type TopologyPack = z.infer<typeof topology>;
