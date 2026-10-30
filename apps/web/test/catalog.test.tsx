// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { generateQuiz, newQuizState } from "@meridian/quiz";
import { CatalogView } from "../components/catalog/CatalogView";
import { HomeModules } from "../components/home/HomeModules";
import {
  EMPTY_FILTER,
  POPULAR,
  SILHOUETTE,
  buildCatalog,
  pickPlaySomething,
  searchCatalog,
  type CatalogState,
} from "../lib/catalog/catalog";
import { catalogKeyOf, playedFrom, readFavorites, setFavorite } from "../lib/catalog/store";
import { LIBRARY, defaultConfig } from "../lib/quiz/library";
import { quizResult } from "../lib/quiz/results";
import { MeridianDb } from "../lib/storage/db";
import { world } from "./fixtures/quiz-world";

afterEach(cleanup);

const items = buildCatalog(world);
const none: CatalogState = { favorites: new Set(), played: new Map() };
const find = (q: string, extra = {}) =>
  searchCatalog(items, { ...EMPTY_FILTER, search: q, ...extra }, none).map((i) => i.title);

describe("search and filters (AC-PL-019)", () => {
  it("'countries world' finds Countries of the World, in under 50 ms", () => {
    const t0 = performance.now();
    const hits = find("countries world");
    expect(performance.now() - t0).toBeLessThan(50);
    expect(hits).toContain("Countries of the World");
    expect(hits).not.toContain("Flags of Europe");
  });
  it("matches entity names: 'paraguay' finds the quizzes whose pool includes it, not African ones", () => {
    const hits = find("paraguay");
    expect(hits).toContain("Countries of the World");
    expect(hits).toContain("Countries of South America");
    expect(hits).not.toContain("Countries of Africa");
  });
  it("ignores case and accents: 'ASUNCIÓN' finds the capitals quizzes that include it", () => {
    expect(find("ASUNCIÓN")).toContain("Capitals of South America");
  });
  it("filters combine with AND", () => {
    const f = (o: Partial<typeof EMPTY_FILTER>) =>
      searchCatalog(items, { ...EMPTY_FILTER, ...o }, none).map((i) => i.key);
    const flags = f({ topic: "flags" });
    const flagsChoice = f({ topic: "flags", format: "Choice" });
    expect(flagsChoice.length).toBeGreaterThan(0);
    expect(flagsChoice.length).toBeLessThan(flags.length);
    expect(flagsChoice.every((k) => flags.includes(k))).toBe(true);
    expect(f({ topic: "flags", region: "AF" })).toEqual(["quiz:flags-of-africa"]);
    expect(f({ topic: "capitals", format: "Map" })).toEqual([]);
    expect(f({ format: "Deduction" })).toEqual(["game:silhouette"]);
  });
  it("favorites only shows just the starred items", () => {
    const state = {
      favorites: new Set(["game:silhouette", "quiz:flags-of-asia"]),
      played: new Map(),
    };
    expect(
      searchCatalog(items, { ...EMPTY_FILTER, favoritesOnly: true }, state)
        .map((i) => i.key)
        .sort(),
    ).toEqual(["game:silhouette", "quiz:flags-of-asia"]);
  });
  it("sorts recommended (unplayed first, weak spots next), A to Z, and recently played", () => {
    const state: CatalogState = {
      favorites: new Set(),
      played: new Map([
        ["game:silhouette", 5],
        ["quiz:flags-of-asia", 9],
        ["quiz:flags-of-europe", 1],
      ]),
      weak: new Set(["quiz:flags-of-europe"]),
    };
    const rec = searchCatalog(items, EMPTY_FILTER, state).map((i) => i.key);
    expect(rec.indexOf("quiz:flags-of-europe")).toBeLessThan(rec.indexOf("quiz:flags-of-asia"));
    expect(rec.indexOf("quiz:countries-of-the-world")).toBeLessThan(
      rec.indexOf("quiz:flags-of-europe"),
    );
    const az = searchCatalog(items, EMPTY_FILTER, state, "az").map((i) => i.title);
    expect(az).toEqual([...az].sort((a, b) => a.localeCompare(b)));
    expect(
      searchCatalog(items, EMPTY_FILTER, state, "recent")
        .slice(0, 3)
        .map((i) => i.key),
    ).toEqual(["quiz:flags-of-asia", "game:silhouette", "quiz:flags-of-europe"]);
  });
  it("without content it still lists everything by title", () => {
    const bare = buildCatalog(null);
    expect(bare).toHaveLength(1 + LIBRARY.length);
    expect(
      searchCatalog(bare, { ...EMPTY_FILTER, search: "flags multiple" }, none).map((i) => i.title),
    ).toContain("Flags (Multiple Choice)");
  });
});

describe("CatalogView", () => {
  const setup = (state: CatalogState = none) => {
    const onToggle = vi.fn();
    render(<CatalogView items={items} state={state} onToggleFavorite={onToggle} />);
    return onToggle;
  };
  it("shows a result count and cards linking to the games", () => {
    setup();
    expect(screen.getByRole("status")).toHaveTextContent(`${items.length} results`);
    expect(screen.getByRole("link", { name: "Silhouette" })).toHaveAttribute(
      "href",
      "/play/silhouette",
    );
    expect(screen.getByRole("link", { name: "Countries of the World" })).toHaveAttribute(
      "href",
      "/play/quiz/countries-of-the-world",
    );
  });
  it("chips combine, say they are pressed with a mark and text, and the empty state offers Clear filters", async () => {
    const user = userEvent.setup();
    setup();
    const topic = screen.getByRole("group", { name: "Topic" });
    await user.click(within(topic).getByRole("button", { name: "Capitals" }));
    expect(within(topic).getByRole("button", { name: "Capitals" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(
      within(screen.getByRole("group", { name: "Format" })).getByRole("button", { name: "Map" }),
    );
    expect(screen.getByText(/No games match Capitals \+ Map/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("status")).toHaveTextContent(`${items.length} results`);
  });
  it("types into search and narrows the list", async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByLabelText("Search games and quizzes"), "countries world");
    expect(screen.getByRole("link", { name: "Countries of the World" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Silhouette" })).toBeNull();
  });
  it("AC-PL-020: the star toggles a favorite through the handler and reflects the saved state", async () => {
    const user = userEvent.setup();
    const onToggle = setup({ favorites: new Set(["game:silhouette"]), played: new Map() });
    const star = screen.getByRole("button", { name: "Remove Silhouette from favorites" });
    expect(star).toHaveAttribute("aria-pressed", "true");
    await user.click(star);
    expect(onToggle).toHaveBeenCalledWith("game:silhouette", false);
    await user.click(screen.getByRole("button", { name: "Add Flags of Asia to favorites" }));
    expect(onToggle).toHaveBeenLastCalledWith("quiz:flags-of-asia", true);
  });
});

describe("favorites and history on this device (AC-PL-020)", () => {
  it("favorites survive a reload: a new connection to the same database reads them back", async () => {
    const name = `fav-${Math.random()}`;
    const a = new MeridianDb(name);
    await a.open();
    expect(await setFavorite(a, "game:silhouette", true)).toBe(true);
    expect(await setFavorite(a, "quiz:flags-of-asia", true)).toBe(true);
    expect(await setFavorite(a, "game:silhouette", false)).toBe(true);
    a.close();
    const b = new MeridianDb(name);
    await b.open();
    expect([...(await readFavorites(b))]).toEqual(["quiz:flags-of-asia"]);
  });
  it("reading and writing fail soft when storage is blocked", async () => {
    const db = new MeridianDb(`blocked-${Math.random()}`);
    await db.open();
    db.close();
    await db.delete();
    const broken = new MeridianDb("never");
    broken.close();
    expect(await readFavorites(broken)).toEqual(new Set());
    expect(await setFavorite(broken, "x", true)).toBe(false);
  });
  it("maps results back to catalog items: Silhouette rounds and named quizzes by template, scope and format", () => {
    const q = LIBRARY.find((x) => x.slug === "countries-of-south-america")!;
    const s = newQuizState(generateQuiz(world, defaultConfig(q), "CATSEED001"));
    const r = quizResult(s, {
      id: "01JC8Z5V6R2Q8T3X9K4M7N1P0A",
      contentVersion: "2026.10.0",
      seed: "CATSEED001",
      kind: "normal",
      resumed: false,
      endedAt: 2000,
      startedAt: 1000,
      now: 0,
    });
    expect(catalogKeyOf(r)).toBe("quiz:countries-of-south-america");
    expect(playedFrom([r]).get("quiz:countries-of-south-america")).toBe(2000);
    expect(catalogKeyOf({ ...r, game_id: "silhouette" })).toBe("game:silhouette");
    expect(catalogKeyOf({ ...r, config: { template: "x" } })).toBeNull();
  });
});

describe("Home (AC-PL-001, AC-PL-024)", () => {
  it("from Home, 'Play something now' is one click to a playable game", () => {
    render(<HomeModules />);
    const cta = screen.getByRole("link", { name: /Play something now/ });
    const playable = new Set(
      items.filter((i) => i.kind === "game" || i.key.startsWith("quiz:")).map((i) => i.href),
    );
    expect(playable.has(cta.getAttribute("href")!)).toBe(true);
    for (let i = 0; i < 50; i++)
      expect(playable.has(pickPlaySomething(items, Math.random).href)).toBe(true);
    expect(pickPlaySomething([], () => 0.5)).toBe(SILHOUETTE);
  });
  it("lists the games, six popular quizzes, and puts Today after the games, as an optional link", () => {
    render(<HomeModules />);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["Games", "Popular quizzes", "Today (optional)"]);
    expect(POPULAR).toHaveLength(6);
    const popular = within(
      screen.getByRole("heading", { name: "Popular quizzes" }).closest("section")!,
    )
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href")!.startsWith("/play/quiz/"));
    expect(popular).toHaveLength(6);
    expect(screen.getByRole("link", { name: "Silhouette daily" })).toHaveAttribute(
      "href",
      "/daily",
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
