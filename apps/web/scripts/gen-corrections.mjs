// Generates lib/generated/corrections.json from content/corrections.yaml (T1.15, UX_AND_DESIGN §10).
// The page imports the JSON so it needs no filesystem access at runtime. A test keeps the two in sync.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const KINDS = ["release", "name", "alias", "capital", "fact", "map", "removed"];

export function releasesOf(doc) {
  if (!doc || !Array.isArray(doc.releases))
    throw new Error("corrections.yaml needs a releases list");
  const seen = new Set();
  return doc.releases.map((r) => {
    if (!/^\d{4}\.\d{2}\.\d+$/.test(String(r.version))) throw new Error(`bad version ${r.version}`);
    if (seen.has(r.version)) throw new Error(`duplicate release ${r.version}`);
    seen.add(r.version);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r.date))) throw new Error(`${r.version}: bad date`);
    if (!Array.isArray(r.changes) || r.changes.length === 0)
      throw new Error(`${r.version}: no changes`);
    return {
      version: String(r.version),
      date: String(r.date),
      changes: r.changes.map((c) => {
        if (!KINDS.includes(c.kind)) throw new Error(`${r.version}: unknown kind ${c.kind}`);
        if (typeof c.text !== "string" || !c.text.trim())
          throw new Error(`${r.version}: empty text`);
        return { kind: c.kind, text: c.text.trim() };
      }),
    };
  });
}

export async function generate() {
  const doc = parse(await readFile(here("../../../content/corrections.yaml"), "utf8"), {
    schema: "core",
  });
  const releases = releasesOf(doc).sort(
    (a, b) => b.date.localeCompare(a.date) || b.version.localeCompare(a.version),
  );
  return `${JSON.stringify(releases, null, 2)}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await writeFile(here("../lib/generated/corrections.json"), await generate());
  console.log("wrote lib/generated/corrections.json");
}
