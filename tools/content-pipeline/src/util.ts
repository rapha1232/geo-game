import { createHash } from "node:crypto";

export const sha256 = (data: string | Uint8Array): string =>
  createHash("sha256").update(data).digest("hex");

/** JSON with sorted object keys and no whitespace: the same value always yields the same bytes. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value))
      throw new TypeError("stableStringify: non-finite number");
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value))
    return `[${value.map((v) => stableStringify(v === undefined ? null : v)).join(",")}]`;
  const o = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const k of Object.keys(o).sort())
    if (o[k] !== undefined) parts.push(`${JSON.stringify(k)}:${stableStringify(o[k])}`);
  return `{${parts.join(",")}}`;
}

/** Coordinates are written with 6 decimals so builds do not depend on float noise (AGENT_HANDOFF). */
export const round6 = (n: number): number => {
  const r = Math.round(n * 1e6) / 1e6;
  return Object.is(r, -0) ? 0 : r;
};

export const USER_AGENT = "Meridian-content-pipeline/0.1 (+https://meridian-quiz.vercel.app)";
