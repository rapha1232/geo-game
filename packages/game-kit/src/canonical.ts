/** Canonical JSON: object keys sorted, no whitespace. `undefined` members are dropped. */
export function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new TypeError("canonicalJSON: non-finite number");
    }
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value))
    return `[${value.map((v) => canonicalJSON(v === undefined ? null : v)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const k of Object.keys(obj).sort()) {
    if (obj[k] === undefined) continue;
    parts.push(`${JSON.stringify(k)}:${canonicalJSON(obj[k])}`);
  }
  return `{${parts.join(",")}}`;
}
