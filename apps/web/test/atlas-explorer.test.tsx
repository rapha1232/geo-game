// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Topology } from "topojson-specification";
import { AtlasExplorer } from "../components/atlas/AtlasExplorer";
import { ServicesContext } from "../components/shell/StorageProvider";
import { MeridianDb } from "../lib/storage/db";
import type { AtlasPacks } from "../lib/atlas/data";

afterEach(cleanup);

const names: [string, string, string][] = [
  ["PER", "Peru", "Lima"],
  ["CHL", "Chile", "Santiago"],
  ["BOL", "Bolivia", "Sucre"],
  ["ECU", "Ecuador", "Quito"],
  ["ARG", "Argentina", "Buenos Aires"],
  ["BRA", "Brazil", "Brasília"],
];
const pop: Record<string, number> = {
  PER: 34e6,
  CHL: 19e6,
  BOL: 12e6,
  ECU: 18e6,
  ARG: 46e6,
  BRA: 212e6,
};
const packs: AtlasPacks = {
  countries: {
    entities: names.map(([iso, name, cap]) => ({
      id: `country:${iso}`,
      names: { canonical: name },
      parent_ids: ["continent:SA"],
      sets: ["sovereign-197"],
      ...(iso === "BOL" ? { landlocked: true } : {}),
      label_point: [0, 0] as [number, number],
      capitals: [{ name: cap, role: "official" }],
      external_ids: { iso2: iso.slice(0, 2) },
    })),
  },
  indicators: {
    stats: [
      {
        id: "population",
        label: "population",
        unit: "people",
        sort: "desc",
        separation: { relative: 0.1 },
        decimals: 0,
        source_id: "wd",
        source_note: "Country population from the content release",
      },
    ],
    values: {
      population: Object.fromEntries(
        Object.entries(pop)
          .filter(([k]) => k !== "ECU")
          .map(([k, v]) => [`country:${k}`, [v, 2024]]),
      ),
    },
  },
  adjacency: { edges: [{ a: "country:CHL", b: "country:PER" }] },
  facts: {
    facts: [
      {
        id: "fact:7",
        text: "Lima is on a desert coast.",
        answer_label: "Lima",
        reveal: "r",
        entities: ["country:PER"],
        status: "published",
        sources: [],
      },
    ],
  },
  topology: {
    type: "Topology",
    objects: { countries: { type: "GeometryCollection", geometries: [] } },
    arcs: [],
  } as unknown as Topology,
};

let db: MeridianDb;
const services = () =>
  ({
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
      pack: async (name: string) =>
        name === "core.countries"
          ? packs.countries
          : name === "core.indicators"
            ? packs.indicators
            : name === "core.adjacency"
              ? packs.adjacency
              : name === "facts.v1"
                ? packs.facts
                : packs.topology,
      manifest: async () => ({ current: "2026.10.0" }),
    },
  }) as never;
const mount = (entity?: string) =>
  render(
    <ServicesContext.Provider value={services()}>
      <AtlasExplorer {...(entity ? { initialEntity: entity } : {})} />
    </ServicesContext.Provider>,
  );

beforeEach(() => {
  db = new MeridianDb(`atlas-${Math.random()}`);
  window.history.replaceState(null, "", "/explore");
});

describe("Atlas Explorer", () => {
  it("AC-AE-012 searching a capital and pressing Enter opens that country's card with the capital shown", async () => {
    const user = userEvent.setup();
    mount();
    const search = await screen.findByLabelText("Search places and capitals");
    await user.type(search, "lima{Enter}");
    const card = await screen.findByRole("complementary", { name: "Place card" });
    expect(within(card).getByRole("heading", { name: /Peru/ })).toBeInTheDocument();
    expect(within(card).getByText("Lima")).toBeInTheDocument();
  });

  it("AC-AE-007 a deep link opens with the card visible", async () => {
    mount("country:PER");
    const card = await screen.findByRole("complementary", { name: "Place card" });
    expect(within(card).getByRole("heading", { name: /Peru/ })).toBeInTheDocument();
  });

  it("AC-AE-001 and AC-AE-011 a value shows its source and year, and a gap says no data", async () => {
    const user = userEvent.setup();
    mount("country:PER");
    const card = await screen.findByRole("complementary", { name: "Place card" });
    expect(within(card).getByText(/34,000,000 people \(Wikidata, 2024\)/)).toBeInTheDocument();
    await user.click(within(card).getByRole("button", { name: "Close card" }));
    await user.click(await screen.findByLabelText("Search places and capitals"));
    await user.type(screen.getByLabelText("Search places and capitals"), "ecuador{Enter}");
    const ecuador = await screen.findByRole("complementary", { name: "Place card" });
    expect(within(ecuador).getAllByText("No data").length).toBeGreaterThan(0);
  });

  it("AC-AE-002 the filter counts matches", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByLabelText("Search places and capitals");
    await user.click(screen.getByRole("button", { name: "Add a condition" }));
    const value = screen.getByLabelText("Value");
    await user.clear(value);
    await user.type(value, "30000000");
    expect(await screen.findByText("3 places match")).toBeInTheDocument();
  });

  it("AC-AE-006 Quiz me is disabled under 4 matches, with an explanation", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByLabelText("Search places and capitals");
    await user.selectOptions(screen.getByLabelText("Layer"), "population");
    await user.click(screen.getByRole("button", { name: "Add a condition" }));
    const value = screen.getByLabelText("Value");
    await user.clear(value);
    await user.type(value, "30000000");
    expect(
      await screen.findByText(/Needs at least 4 matching places. This filter has 3./),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Reset filter/ }));
    expect(screen.getByRole("link", { name: "Order countries by population" })).toHaveAttribute(
      "href",
      expect.stringContaining("/play/rank-it?stat=population"),
    );
  });

  it("AC-AE-003 the table lists the same top places as the map's top class, in order", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByLabelText("Search places and capitals");
    await user.selectOptions(screen.getByLabelText("Layer"), "population");
    await user.selectOptions(screen.getByLabelText("View"), "table");
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Brazil");
    expect(rows[0]).toHaveTextContent("1");
    expect(rows.map((r) => r.querySelector("th")?.textContent?.trim()).slice(0, 3)).toEqual([
      "🇧🇷 Brazil",
      "🇦🇷 Argentina",
      "🇵🇪 Peru",
    ]);
  });

  it("AC-AE-004 compare holds three, replacing the oldest with a notice", async () => {
    const user = userEvent.setup();
    mount();
    const search = await screen.findByLabelText("Search places and capitals");
    for (const q of ["peru", "chile", "bolivia", "brazil"]) {
      await user.clear(search);
      await user.type(search, `${q}{Enter}`);
      await user.click(await screen.findByRole("button", { name: "＋ Compare" }));
    }
    const tray = screen.getByRole("region", { name: "Compare" });
    expect(within(tray).queryByText("Peru")).toBeNull();
    expect(within(tray).getByText("Brazil")).toBeInTheDocument();
    expect(screen.getByText("Compare holds 3 places, so Peru was replaced.")).toBeInTheDocument();
  });

  it("AC-AE-008 and AC-AE-009 opening a card marks its facts seen and counts a new country once", async () => {
    const user = userEvent.setup();
    mount("country:PER");
    await screen.findByRole("complementary", { name: "Place card" });
    await waitFor(async () =>
      expect(
        (await db.history.toArray()).find((r) => r.game_id === "fact-pin")?.target_ids ?? [],
      ).toContain("fact:7"),
    );
    expect(await screen.findByText("Discovered 1 of 6 countries")).toBeInTheDocument();
    const search = screen.getByLabelText("Search places and capitals");
    await user.type(search, "peru{Enter}");
    expect(await screen.findByText("Discovered 1 of 6 countries")).toBeInTheDocument();
    await user.type(search, "chile{Enter}");
    expect(await screen.findByText("Discovered 2 of 6 countries")).toBeInTheDocument();
  });

  it("AC-AE-013 restores layer, filter and selection from the URL", async () => {
    window.history.replaceState(
      null,
      "",
      "/explore?layer=population&filter=population%3E30000000&sel=country:PER",
    );
    mount();
    expect(await screen.findByText("3 places match")).toBeInTheDocument();
    expect((await screen.findByLabelText("Layer")) as HTMLSelectElement).toHaveValue("population");
    expect(await screen.findByRole("heading", { name: /Peru/ })).toBeInTheDocument();
  });

  it("AC-AE-014 works from the keyboard: search, open a card, add to compare with C", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByLabelText("Search places and capitals");
    await user.keyboard("/");
    expect(screen.getByLabelText("Search places and capitals")).toHaveFocus();
    await user.keyboard("chile{Enter}");
    await screen.findByRole("complementary", { name: "Place card" });
    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard("c");
    expect(
      within(screen.getByRole("region", { name: "Compare" })).getByText("Chile"),
    ).toBeInTheDocument();
  });
});
