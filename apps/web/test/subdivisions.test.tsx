// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { SubdivisionGame } from "../components/subdivisions/SubdivisionGame";
import { ServicesContext } from "../components/shell/StorageProvider";
import { MeridianDb } from "../lib/storage/db";
import { findSubCountry, pluralKind, subTitle, SUB_COUNTRIES } from "../lib/subdivisions/list";
import { catalogKeyOf } from "../lib/catalog/store";
import { subdivisionResult } from "../lib/results/subdivisions";
import { newNameAll } from "@meridian/quiz";

afterEach(cleanup);

const subs = [
  ["US-CA", "California", "CA"],
  ["US-NY", "New York", "NY"],
  ["US-TX", "Texas", "TX"],
  ["US-WA", "Washington", "WA"],
].map(([code, name, postal]) => ({
  id: `subdivision:${code}`,
  name,
  aliases: [{ text: postal!, kind: "code" }],
  code: code!,
  label_point: [0, 0] as [number, number],
}));
const index = { countries: { USA: { name: "United States", kind: "state", subdivisions: subs } } };
const topology = {
  type: "Topology",
  objects: { subdivisions: { type: "GeometryCollection", geometries: [] } },
  arcs: [],
};
const mount = () => {
  const db = new MeridianDb(`sb-${Math.random()}`);
  const value = {
    db,
    online: true,
    status: "ok",
    store: {
      find: async () => undefined,
      save: () => undefined,
      flush: async () => undefined,
      discard: async () => undefined,
    },
    loader: {
      manifest: async () => ({ current: "2026.10.0" }),
      pack: async (n: string) => (n === "core.subdivisions" ? index : topology),
    },
  } as never;
  render(
    <ServicesContext.Provider value={value}>
      <SubdivisionGame code="usa" />
    </ServicesContext.Provider>,
  );
  return db;
};

describe("Subdivisions", () => {
  it("lists twelve countries with a plural title", () => {
    expect(SUB_COUNTRIES).toHaveLength(12);
    expect(subTitle(findSubCountry("aus")!)).toBe("Australia: States and territories");
    expect(pluralKind("province")).toBe("provinces");
  });

  it("Name them all: names and postal codes count, and the round ends with a score and a saved result", async () => {
    const user = userEvent.setup();
    const db = mount();
    await user.click(await screen.findByRole("button", { name: "Start" }));
    const input = await screen.findByLabelText("Type a name");
    await user.type(input, "california");
    expect(screen.getByText("1 of 4 named")).toBeInTheDocument();
    await user.type(input, "NY{Enter}");
    expect(screen.getByText("2 of 4 named")).toBeInTheDocument();
    await user.type(input, "narnia{Enter}");
    expect(screen.getByText("Not recognised here.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Give up" }));
    expect(await screen.findByText("You gave up with 50%.")).toBeInTheDocument();
    expect(screen.getByText(/Missed: .*Texas|Missed: .*Washington/)).toBeInTheDocument();
    await waitFor(async () => expect(await db.results.count()).toBe(1));
  });

  it("Find it: asks for a place, counts tries and reports progress", async () => {
    const user = userEvent.setup();
    mount();
    await user.selectOptions(await screen.findByLabelText("Format"), "find");
    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(await screen.findByText(/^Find: /)).toBeInTheDocument();
    expect(screen.getByText("0 of 4 found")).toBeInTheDocument();
    expect(screen.getByText("3 tries left")).toBeInTheDocument();
  });

  it("a result carries its country and finds its catalog entry", () => {
    const r = subdivisionResult(newNameAll("USA", subs as never), {
      id: "01J00000000000000000000000",
      seed: "K7Q2M9XD1A",
      contentVersion: "2026.10.0",
      startedAt: 0,
      endedAt: 5000,
    });
    expect(r.pb_key).toBe("sub|USA|sub-name");
    expect(catalogKeyOf(r)).toBe("quiz:subdivisions-usa");
  });
});
