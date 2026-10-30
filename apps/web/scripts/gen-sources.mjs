// Generates lib/generated/sources.json from data/sources.registry.yaml (T1.18, AC-PL-022).
// The page imports the JSON so it needs no filesystem access at runtime. A test keeps the two in sync.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

export function shippedSources(registry) {
  return registry.sources
    .filter((s) => s.verification === "done" && s.used_in.length > 0)
    .map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      license: s.license,
      licenseUrl: s.license_url ?? null,
      attribution: s.attribution_text ?? null,
      attributionRequired: s.attribution_required,
    }));
}

export async function generate() {
  const registry = parse(await readFile(here("../../../data/sources.registry.yaml"), "utf8"), {
    schema: "core",
  });
  return `${JSON.stringify(shippedSources(registry), null, 2)}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await writeFile(here("../lib/generated/sources.json"), await generate());
  console.log("wrote lib/generated/sources.json");
}
