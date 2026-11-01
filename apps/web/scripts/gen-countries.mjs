// Generates lib/generated/countries.json from content/sets/sovereign-197.yaml and content/countries.yaml.
// Server code (titles, 404s for unknown Atlas places, the sitemap, share images) imports the JSON, so it needs no
// content pack at request time. A test keeps the two in sync.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

export function countriesOf(set, names) {
  return set.members
    .map((m) => {
      const name = names.countries[m.code]?.name;
      if (typeof name !== "string") throw new Error(`no name for ${m.code} in countries.yaml`);
      return { code: m.code, name };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
}

export async function generate() {
  const read = async (p) => parse(await readFile(here(p), "utf8"), { schema: "core" });
  const set = await read("../../../content/sets/sovereign-197.yaml");
  const names = await read("../../../content/countries.yaml");
  return `${JSON.stringify(countriesOf(set, names), null, 2)}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await writeFile(here("../lib/generated/countries.json"), await generate());
  console.log("wrote lib/generated/countries.json");
}
