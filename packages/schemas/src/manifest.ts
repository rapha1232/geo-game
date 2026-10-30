import { z } from "zod";
import { contentVersion, isoDateTime, sha256Hex } from "./ids";

/** `<family>.<name>[.<variant>]`, e.g. `core.countries`, `geo.world.110m`. */
export const packName = z.string().regex(/^[a-z0-9]+(\.[a-z0-9-]+)+$/);

export const packEntry = z.object({
  url: z.string().min(1),
  bytes: z.number().int().positive(),
  sha256: sha256Hex,
});

export const manifestVersion = z.object({
  released_at: isoDateTime,
  packs: z.record(packName, packEntry),
  licenses: z.array(z.string().min(1)),
  notes_url: z.string().min(1),
});

/** `manifest.json` (DATA_MODEL §2.1). */
export const manifest = z
  .object({
    current: contentVersion,
    versions: z.record(contentVersion, manifestVersion),
  })
  .superRefine((m, ctx) => {
    if (!(m.current in m.versions))
      ctx.addIssue({
        code: "custom",
        path: ["current"],
        message: "current is not listed in versions",
      });
  });
export type Manifest = z.infer<typeof manifest>;
export type PackEntry = z.infer<typeof packEntry>;
