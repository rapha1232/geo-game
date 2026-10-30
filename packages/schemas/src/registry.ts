import { z } from "zod";
import { isoDate } from "./ids";

export const SOURCE_KINDS = ["dataset", "font", "icons", "image"] as const;
export const VERIFICATION = ["done", "pending", "rejected"] as const;

/** One entry of `data/sources.registry.yaml` (DATA_AND_CONTENT §1–2). */
export const sourceEntry = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    name: z.string().min(1),
    kind: z.enum(SOURCE_KINDS),
    license: z.string().min(1),
    license_url: z.string().url().optional(),
    attribution_required: z.boolean(),
    attribution_text: z.string().min(1).optional(),
    verification: z.enum(VERIFICATION),
    verified_on: isoDate.optional(),
    evidence: z.string().min(1).optional(),
    notes: z.string().optional(),
    used_in: z.array(z.string().min(1)),
  })
  .superRefine((s, ctx) => {
    if (s.verification === "done") {
      if (!s.verified_on)
        ctx.addIssue({
          code: "custom",
          path: ["verified_on"],
          message: "verified sources need verified_on",
        });
      if (!s.evidence)
        ctx.addIssue({
          code: "custom",
          path: ["evidence"],
          message: "verified sources need the evidence that was read",
        });
    }
    if (s.attribution_required && !s.attribution_text)
      ctx.addIssue({
        code: "custom",
        path: ["attribution_text"],
        message: "attribution_required needs attribution_text",
      });
    if (s.verification === "rejected" && s.used_in.length > 0)
      ctx.addIssue({
        code: "custom",
        path: ["used_in"],
        message: "a rejected source cannot be used in any pack",
      });
  });

export const sourceRegistry = z
  .object({ sources: z.array(sourceEntry).min(1) })
  .superRefine((r, ctx) => {
    const seen = new Set<string>();
    for (const [i, s] of r.sources.entries()) {
      if (seen.has(s.id))
        ctx.addIssue({
          code: "custom",
          path: ["sources", i, "id"],
          message: `duplicate source id ${s.id}`,
        });
      seen.add(s.id);
    }
  });
export type SourceEntry = z.infer<typeof sourceEntry>;
export type SourceRegistry = z.infer<typeof sourceRegistry>;

/** Licenses that may never ship (DATA_AND_CONTENT §2.1): non-commercial and unknown. */
const BLOCKED_LICENSE = /(^|\b)(unknown|not stated)\b|\bNC\b|non-?commercial/i;

/**
 * LICENSE_UNVERIFIED: the problems that stop a release pack from using these sources.
 * An unknown source id is also a problem (a pack cannot cite something the registry has not heard of).
 */
export function licenseProblems(registry: SourceRegistry, usedIds: readonly string[]): string[] {
  const byId = new Map(registry.sources.map((s) => [s.id, s]));
  const problems: string[] = [];
  for (const id of new Set(usedIds)) {
    const s = byId.get(id);
    if (!s) problems.push(`${id}: not in the source registry`);
    else if (s.verification !== "done") problems.push(`${id}: verification is ${s.verification}`);
    else if (BLOCKED_LICENSE.test(s.license))
      problems.push(`${id}: license "${s.license}" is not allowed in packs`);
  }
  return problems;
}
