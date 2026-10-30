import { z } from "zod";
import { entityId, factId, featureId, isoDate, latLon } from "./ids";

export const FACT_STATUSES = ["draft", "published", "suspended", "retired"] as const;
export const PRECISIONS = ["exact", "city", "region", "country", "broad"] as const;
export type Precision = (typeof PRECISIONS)[number];

export const source = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  license: z.string().min(1),
});

/** Where the answer is (fact-pin §4.1). */
export const factTarget = z.discriminatedUnion("type", [
  z.object({ type: z.literal("point"), coords: latLon }),
  z.object({ type: z.literal("entity"), id: entityId }),
  z.object({ type: z.literal("polygon"), ref: featureId }),
]);

/** Fact record (fact-pin §4.1) with the common editorial fields (DATA_MODEL §2.7). */
export const fact = z
  .object({
    id: factId,
    text: z.string().min(1),
    answer_label: z.string().min(1),
    category: z.string().min(1),
    era: z.string().min(1),
    precision: z.enum(PRECISIONS),
    target: factTarget,
    tolerance_km: z.number().nonnegative().optional(),
    reveal: z.string().min(1),
    sources: z.array(source),
    difficulty: z.number().min(0).max(1),
    entities: z.array(entityId),
    status: z.enum(FACT_STATUSES),
    reviewed_at: isoDate.nullable(),
    review_due: isoDate.nullable(),
    sensitive: z.boolean().optional(),
    /** Continent code of the answer (AF, AS, EU, NA, OC, SA), for run composition and the balance quotas. */
    continent: z.enum(["AF", "AS", "EU", "NA", "OC", "SA"]).optional(),
    /** Built from data by a template (capitals and cities), not written by an editor: exempt from the word-count and naming rules. */
    generated: z.boolean().optional(),
  })
  .superRefine((f, ctx) => {
    const words = f.text.trim().split(/\s+/).length;
    if (f.status === "published") {
      if (f.sources.length < 1)
        ctx.addIssue({
          code: "custom",
          path: ["sources"],
          message: "a published fact needs at least one source (FACT_NO_SOURCE)",
        });
      if (!f.reviewed_at)
        ctx.addIssue({
          code: "custom",
          path: ["reviewed_at"],
          message: "a published fact needs reviewed_at",
        });
      if (!f.generated && (words < 12 || words > 35))
        ctx.addIssue({
          code: "custom",
          path: ["text"],
          message: `fact text is ${words} words, expected 12–35`,
        });
    }
    if (f.precision === "exact" && f.target.type !== "point")
      ctx.addIssue({
        code: "custom",
        path: ["target"],
        message: "exact precision needs a point target",
      });
    if (f.target.type === "point" && f.tolerance_km === undefined)
      ctx.addIssue({
        code: "custom",
        path: ["tolerance_km"],
        message: "a point target needs tolerance_km",
      });
  });
export type Fact = z.infer<typeof fact>;
