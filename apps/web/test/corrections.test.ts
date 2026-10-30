import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script without types
import { generate, releasesOf } from "../scripts/gen-corrections.mjs";
import corrections from "../lib/generated/corrections.json";

describe("corrections changelog (T1.15)", () => {
  it("lib/generated/corrections.json matches content/corrections.yaml (run `pnpm --filter @meridian/web gen:corrections`)", async () => {
    const onDisk = await readFile(
      new URL("../lib/generated/corrections.json", import.meta.url),
      "utf8",
    );
    expect(onDisk).toBe(await generate());
  });

  it("lists the current content release first", async () => {
    const current = (
      await readFile(new URL("../../../content/version.txt", import.meta.url), "utf8")
    ).trim();
    expect(corrections.some((r) => r.version === current)).toBe(true);
  });

  it("rejects malformed entries", () => {
    const ok = {
      version: "2026.11.0",
      date: "2026-11-01",
      changes: [{ kind: "name", text: "Fixed a name." }],
    };
    expect(() => releasesOf({ releases: [ok] })).not.toThrow();
    expect(() => releasesOf({ releases: [{ ...ok, version: "v1" }] })).toThrow();
    expect(() => releasesOf({ releases: [{ ...ok, changes: [] }] })).toThrow();
    expect(() =>
      releasesOf({ releases: [{ ...ok, changes: [{ kind: "x", text: "y" }] }] }),
    ).toThrow();
    expect(() => releasesOf({ releases: [ok, ok] })).toThrow();
  });
});
