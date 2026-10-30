// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatDistance } from "@meridian/silhouette";
import { SettingsPage } from "../components/settings/SettingsPage";
import { ServicesContext } from "../components/shell/StorageProvider";
import { silhouetteResult, masteryUpdates } from "../lib/results/silhouette";
import { saveRound } from "../lib/results/save";
import { overview, perGame, masteryByEntity } from "../lib/results/stats";
import {
  DEFAULT_CONFIG,
  answer,
  guess,
  newSession,
  type Session,
} from "../lib/silhouette/controller";
import {
  DEFAULT_SETTINGS,
  applySettings,
  loadSettings,
  resolveUnits,
  sanitize,
  saveSettings,
  unitForLocale,
} from "../lib/settings/settings";
import { ImportError, deleteAll, exportData, importData, parseExport } from "../lib/settings/data";
import { MeridianDb } from "../lib/storage/db";
import { world } from "./fixtures/mini-world";

afterEach(cleanup);

const T0 = Date.parse("2026-11-05T08:00:00Z");
const fresh = () => new MeridianDb(`settings-${Math.random()}`);

async function play(db: MeridianDb, seed: string, offset: number): Promise<void> {
  const now = T0 + offset;
  let s: Session = newSession(world, seed, DEFAULT_CONFIG, [], now);
  s = guess(world, s, world.byId.get(s.round.targetId)!.name, now + 20_000);
  s = answer(s, 0, s.followUps[0]!.prompt.correctIndex);
  s = answer(s, 1, s.followUps[1]!.prompt.correctIndex);
  const id = `01JD${String(offset).padStart(22, "0")}`;
  const result = silhouetteResult(s, { id, contentVersion: "2026.10.0", endedAt: now + 60_000 });
  await saveRound(db, { result, mastery: masteryUpdates(s, new Map(), now + 60_000) });
}

describe("settings", () => {
  it("AC-PL-021: miles change the distances (865 km becomes 537 mi)", () => {
    expect(formatDistance(865, "km")).toBe("865");
    expect(formatDistance(865, "mi")).toBe("537");
  });

  it("picks miles from the locale unless set", () => {
    expect(unitForLocale("en-US")).toBe("mi");
    expect(unitForLocale("de-DE")).toBe("km");
    expect(unitForLocale(undefined)).toBe("km");
    expect(resolveUnits({ ...DEFAULT_SETTINGS, units: "mi" }, "de-DE")).toBe("mi");
    expect(resolveUnits({ ...DEFAULT_SETTINGS, units: "km" }, "en-US")).toBe("km");
  });

  it("ignores invalid stored values and keeps game keys beside the prefs", async () => {
    expect(sanitize({ units: "furlongs", strictness: 3, highContrast: "yes" })).toEqual(
      DEFAULT_SETTINGS,
    );
    const db = fresh();
    await db.settings.put({ key: "settings", value: { "fact-pin": { timerSec: 15 } } });
    await saveSettings(db, { ...DEFAULT_SETTINGS, units: "mi" });
    expect((await db.settings.get("settings"))?.value["fact-pin"]).toEqual({ timerSec: 15 });
    expect((await loadSettings(db)).units).toBe("mi");
  });

  it("sets and clears the document attributes", () => {
    const root = document.createElement("html");
    applySettings({ ...DEFAULT_SETTINGS, reducedMotion: "reduce", highContrast: true }, root);
    expect(root.getAttribute("data-motion")).toBe("reduce");
    expect(root.getAttribute("data-contrast")).toBe("high");
    applySettings(DEFAULT_SETTINGS, root);
    expect(root.hasAttribute("data-motion")).toBe(false);
    expect(root.hasAttribute("data-contrast")).toBe(false);
  });
});

describe("export and import", () => {
  let a: MeridianDb;
  beforeEach(async () => {
    a = fresh();
    await play(a, "AAAAAAAAAA", 0);
    await play(a, "BBBBBBBBBB", 100_000);
    await a.favorites.put({ item_key: "game:silhouette" });
    await saveSettings(a, { ...DEFAULT_SETTINGS, units: "mi" });
  });

  it("AC-PL-023: a fresh profile that imports an export shows the same stats", async () => {
    const file = parseExport(JSON.stringify(await exportData(a, T0)));
    const b = fresh();
    const summary = await importData(b, file);
    expect(summary).toMatchObject({ results: 2, skipped: 0 });
    const results = async (db: MeridianDb) =>
      (await db.results.toArray()).map((r) => r.data) as Parameters<typeof overview>[0];
    const [ra, rb] = [await results(a), await results(b)];
    expect(overview(rb)).toEqual(overview(ra));
    expect(perGame(rb)).toEqual(perGame(ra));
    expect(masteryByEntity(await b.mastery.toArray())).toEqual(
      masteryByEntity(await a.mastery.toArray()),
    );
    expect(await b.favorites.toArray()).toEqual([{ item_key: "game:silhouette" }]);
    expect((await loadSettings(b)).units).toBe("mi");
  });

  it("importing twice changes nothing, and local settings win", async () => {
    const file = parseExport(JSON.stringify(await exportData(a, T0)));
    const b = fresh();
    await saveSettings(b, { ...DEFAULT_SETTINGS, units: "km" });
    await importData(b, file);
    await importData(b, file);
    expect(await b.results.count()).toBe(2);
    expect((await loadSettings(b)).units).toBe("km");
  });

  it("skips results that fail the schema and rejects files that are not exports", async () => {
    const data = await exportData(a, T0);
    data.results.push({ id: "bad", data: { id: "bad" } });
    const summary = await importData(fresh(), parseExport(JSON.stringify(data)));
    expect(summary).toMatchObject({ results: 2, skipped: 1 });
    expect(() => parseExport("nope")).toThrow(ImportError);
    expect(() => parseExport(JSON.stringify({ app: "other" }))).toThrow("not-meridian");
    expect(() => parseExport(JSON.stringify({ app: "meridian", format: 1 }))).toThrow("damaged");
  });

  it("deleteAll empties the profile", async () => {
    await deleteAll(a);
    expect(await a.results.count()).toBe(0);
    expect(await a.mastery.count()).toBe(0);
    expect(await a.favorites.count()).toBe(0);
    expect((await loadSettings(a)).units).toBe("auto");
  });
});

describe("Settings page", () => {
  const services = (db: MeridianDb) =>
    ({
      db,
      store: { flush: async () => undefined },
      loader: {},
      status: "ok",
      online: true,
    }) as never;

  it("saves a change and applies it", async () => {
    const user = userEvent.setup();
    const db = fresh();
    render(
      <ServicesContext.Provider value={services(db)}>
        <SettingsPage />
      </ServicesContext.Provider>,
    );
    const units = await screen.findByLabelText("Distance units");
    await waitFor(() => expect((units as HTMLSelectElement).disabled).toBe(false));
    await user.selectOptions(units, "mi");
    await user.click(screen.getByLabelText("High-contrast map colours"));
    await waitFor(async () => expect((await loadSettings(db)).units).toBe("mi"));
    expect((await loadSettings(db)).highContrast).toBe(true);
    expect(document.documentElement.getAttribute("data-contrast")).toBe("high");
    document.documentElement.removeAttribute("data-contrast");
  });

  it("asks before deleting, then deletes", async () => {
    const user = userEvent.setup();
    const db = fresh();
    await db.favorites.put({ item_key: "x" });
    render(
      <ServicesContext.Provider value={services(db)}>
        <SettingsPage />
      </ServicesContext.Provider>,
    );
    await user.click(await screen.findByRole("button", { name: "Delete all data on this device" }));
    expect(await db.favorites.count()).toBe(1);
    await user.click(await screen.findByRole("button", { name: "Delete all data" }));
    await waitFor(async () => expect(await db.favorites.count()).toBe(0));
  });
});
