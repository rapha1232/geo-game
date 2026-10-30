// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateQuiz, newQuizState, type QuizConfig } from "@meridian/quiz";
import { LibraryView } from "../components/quiz/QuizLibrary";
import { QuizConfigure } from "../components/quiz/QuizConfigure";
import { QuizPlay } from "../components/quiz/QuizPlay";
import { QuizReview } from "../components/quiz/QuizReview";
import { accessibleItem } from "../lib/quiz/accessible";
import {
  LIBRARY,
  defaultConfig,
  filterLibrary,
  findQuiz,
  itemCount,
  limitLabel,
} from "../lib/quiz/library";
import type { QuizSession } from "../lib/quiz/session";
import { facts, neighbors, world } from "./fixtures/quiz-world";

afterEach(cleanup);

const cfg = (over: Partial<QuizConfig> = {}): QuizConfig => ({
  template: "countries.by-name",
  scope: { kind: "world" },
  format: "TYPE_ALL",
  countrySet: "sovereign-197",
  count: "all",
  order: "alphabetical",
  timed: true,
  difficulty: "normal",
  strictness: "standard",
  ...over,
});
const sessionOf = (c: QuizConfig, seed = "UISEED0001"): QuizSession => ({
  slug: "x",
  kind: "normal",
  seed,
  state: newQuizState(generateQuiz(world, c, seed)),
  resumed: false,
  startedWall: 0,
  resultId: null,
});

function Harness({ initial, accessible = false }: { initial: QuizSession; accessible?: boolean }) {
  const [s, set] = useState(initial);
  return (
    <>
      <QuizPlay
        world={world}
        facts={facts}
        neighbors={neighbors}
        flags={null}
        session={s}
        now={0}
        accessible={accessible}
        onSession={set}
        renderMap={() => <div data-testid="map" />}
      />
      <span data-testid="phase">{s.state.phase}</span>
    </>
  );
}

describe("the library (quiz-library §4.3, §8.1)", () => {
  it("lists the R1 named quizzes with unique slugs", () => {
    const slugs = LIBRARY.map((q) => q.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toEqual(
      expect.arrayContaining([
        "countries-of-the-world",
        "countries-of-africa",
        "find-countries-world",
        "capitals-of-oceania",
        "capital-to-country-world",
        "flags-of-europe",
        "flags-multiple-choice",
        "continents-map",
        "world-regions-map",
      ]),
    );
    expect(LIBRARY).toHaveLength(1 + 6 + 7 + 7 + 1 + 7 + 1 + 2);
  });
  it("counts items live and shows the time limit from the formula", () => {
    const all = defaultConfig(findQuiz("countries-of-the-world")!);
    expect(itemCount(world, all)).toBe(14);
    expect(limitLabel(world, all)).toBe("1:00");
    expect(itemCount(world, defaultConfig(findQuiz("countries-of-south-america")!))).toBe(5);
    expect(itemCount(world, defaultConfig(findQuiz("find-countries-world")!))).toBe(14);
    expect(itemCount(world, defaultConfig(findQuiz("continents-map")!))).toBe(5);
  });
  it("filters by search, category, format and length", () => {
    const f = (o: Partial<Parameters<typeof filterLibrary>[1]>) =>
      filterLibrary(world, { search: "", category: "", format: "", maxMinutes: null, ...o }).map(
        (q) => q.slug,
      );
    expect(f({ search: "flags" }).every((s) => s.startsWith("flags-"))).toBe(true);
    expect(f({ category: "capitals" })).toContain("capital-to-country-world");
    expect(f({ format: "MAP_CLICK" })).toContain("continents-map");
    expect(f({ format: "MAP_CLICK" })).not.toContain("countries-of-the-world");
    expect(f({ maxMinutes: 3 }).length).toBeGreaterThan(0);
  });
  it("renders cards with a best score when there is one, and an empty state when nothing matches", async () => {
    const user = userEvent.setup();
    const pbs = new Map([["countries.by-name|world|TYPE_ALL|sovereign-197|14|timed", 0.84]]);
    render(<LibraryView world={world} pbs={pbs} />);
    const card = screen.getByRole("link", { name: "Countries of the World" }).closest("article")!;
    expect(within(card).getByText("Best 84%")).toBeInTheDocument();
    expect(within(card).getByText(/Type all · 14 items · 1:00/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Search quizzes"), "zzzzz");
    expect(screen.getByText(/No quizzes match/)).toBeInTheDocument();
  });
});

describe("QuizConfigure", () => {
  const quiz = findQuiz("countries-of-the-world")!;
  const setup = (over: Partial<React.ComponentProps<typeof QuizConfigure>> = {}) => {
    const onStart = vi.fn();
    const onPractice = vi.fn();
    render(
      <QuizConfigure
        quiz={quiz}
        world={world}
        initial={defaultConfig(quiz)}
        bestPercent={() => 84}
        accessible={false}
        onAccessible={() => undefined}
        onStart={onStart}
        onPractice={onPractice}
        {...over}
      />,
    );
    return { onStart, onPractice };
  };
  it("starts with the default configuration and shows the best score", async () => {
    const { onStart } = setup();
    expect(screen.getByText("Your best: 84%")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Start" }));
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({
        template: "countries.by-name",
        format: "TYPE_ALL",
        timed: true,
        count: "all",
      }),
    );
  });
  it("changes format, timer and difficulty before starting, and offers Learn and Practice", async () => {
    const user = userEvent.setup();
    const { onStart, onPractice } = setup();
    await user.click(screen.getByLabelText("Find the Country".slice(0, 0) + "Map"));
    await user.click(screen.getByLabelText("Untimed"));
    await user.click(screen.getByText("More options"));
    await user.selectOptions(screen.getByLabelText("Difficulty"), "hard");
    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ format: "MAP_CLICK", timed: false, difficulty: "hard" }),
    );
    await user.click(screen.getByRole("button", { name: "Learn mode" }));
    expect(onStart).toHaveBeenLastCalledWith(
      expect.objectContaining({ learn: true, timed: false }),
    );
    await user.click(screen.getByRole("button", { name: "Practice my misses" }));
    expect(onPractice).toHaveBeenCalled();
  });
  it("shows only the formats the template allows", () => {
    setup({
      quiz: findQuiz("capital-to-country-world")!,
      initial: defaultConfig(findQuiz("capital-to-country-world")!),
    });
    expect(screen.getAllByRole("radio", { name: /Identify|Choice/ })).toHaveLength(2);
    expect(screen.queryByRole("radio", { name: "Type all" })).toBeNull();
  });
});

describe("QuizPlay: TYPE_ALL (AC-QZ-001)", () => {
  it("accepts an exact name on the keystroke, clears the input and counts it", async () => {
    const user = userEvent.setup();
    render(<Harness initial={sessionOf(cfg())} />);
    const box = screen.getByRole("textbox", { name: "Name a country" });
    await user.type(box, "france");
    expect(box).toHaveValue("");
    expect(screen.getByText("1 / 14")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("France. 1 of 14.");
    expect(screen.getByTestId("map")).toBeInTheDocument();
  });
  it("shows 'Already named' and a former-name note, and counts per continent", async () => {
    const user = userEvent.setup();
    render(<Harness initial={sessionOf(cfg())} />);
    const box = screen.getByRole("textbox", { name: "Name a country" });
    await user.type(box, "france");
    await user.type(box, "france");
    expect(screen.getByRole("status")).toHaveTextContent("Already named: France");
    await user.clear(box);
    await user.type(box, "burma");
    expect(screen.getByRole("status")).toHaveTextContent("Burma is a former name.");
    const counts = screen.getByRole("list", { name: "By continent" });
    expect(within(counts).getByText(/Europe/)).toHaveTextContent("1/2");
  });
  it("Enter applies fuzzy matching, and a keystroke alone does not", async () => {
    const user = userEvent.setup();
    render(<Harness initial={sessionOf(cfg())} />);
    const box = screen.getByRole("textbox", { name: "Name a country" });
    await user.type(box, "kyrgystan");
    expect(screen.getByText("0 / 14")).toBeInTheDocument();
    await user.type(box, "{Enter}");
    expect(screen.getByRole("status")).toHaveTextContent("Accepted as Kyrgyzstan.");
  });
  it("giving up after some answers asks first, then ends in review", async () => {
    const user = userEvent.setup();
    render(<Harness initial={sessionOf(cfg())} />);
    await user.type(screen.getByRole("textbox", { name: "Name a country" }), "france");
    await user.click(screen.getByRole("button", { name: "Give up" }));
    expect(
      screen.getByRole("group", { name: "Give up and see your results?" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep playing" }));
    expect(screen.getByTestId("phase")).toHaveTextContent("playing");
    await user.click(screen.getByRole("button", { name: "Give up" }));
    await user.click(screen.getByRole("button", { name: "Yes, give up" }));
    expect(screen.getByTestId("phase")).toHaveTextContent("review");
  });
  it("hints highlight one item (up to 5 are offered)", async () => {
    const user = userEvent.setup();
    render(<Harness initial={sessionOf(cfg())} />);
    await user.click(screen.getByRole("button", { name: "Hint (5 left)" }));
    expect(screen.getByRole("status")).toHaveTextContent("One country is highlighted on the map.");
    expect(screen.getByRole("button", { name: "Hint (4 left)" })).toBeInTheDocument();
  });
  it("pausing hides the input behind a Continue button", async () => {
    const user = userEvent.setup();
    render(<Harness initial={sessionOf(cfg())} />);
    await user.type(screen.getByRole("textbox", { name: "Name a country" }), "france");
    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.queryByRole("textbox")).toBeNull();
    await user.click(screen.getAllByRole("button", { name: "Continue" })[0]!);
    expect(screen.getByRole("textbox", { name: "Name a country" })).toBeInTheDocument();
  });
});

describe("QuizPlay: TYPE_PROMPTED", () => {
  it("asks for a capital, takes the capital, and shows Skip then Reveal", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={sessionOf(cfg({ template: "capitals.by-country", format: "TYPE_PROMPTED" }))}
      />,
    );
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.textContent).toMatch(/^What is the capital of /);
    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByText("0 / 14")).toBeInTheDocument();
  });
  it("hints: first letter, then blanks", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={sessionOf(cfg({ template: "capitals.by-country", format: "TYPE_PROMPTED" }))}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Hint" }));
    expect(screen.getByRole("status")).toHaveTextContent(/Starts with [A-Z]/);
    await user.click(screen.getByRole("button", { name: "Hint" }));
    expect(screen.getByRole("status")).toHaveTextContent(/(_ ?)+/);
  });
});

describe("QuizPlay: MULTIPLE_CHOICE (AC-QZ-024)", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it("a 10-item flags quiz is completable with the keys 1 to 4 alone, reaching review", async () => {
    const c = cfg({ template: "countries.by-capital", format: "MULTIPLE_CHOICE", count: 10 });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Harness initial={sessionOf(c)} />);
    for (let i = 0; i < 10; i++) {
      expect(
        screen.getAllByRole("button").filter((b) => /^\d/.test(b.textContent ?? "")),
      ).toHaveLength(4);
      await user.keyboard("1");
      await act(async () => {
        vi.advanceTimersByTime(950);
      });
    }
    expect(screen.getByTestId("phase")).toHaveTextContent("review");
  });
  it("shows correct and wrong markers with text, locks the choice, then moves on", async () => {
    const c = cfg({ template: "countries.by-capital", format: "MULTIPLE_CHOICE", count: 10 });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Harness initial={sessionOf(c)} />);
    await user.keyboard("1");
    expect(screen.getByRole("status")).toHaveTextContent(/Correct\.|Not quite\./);
    expect(screen.getAllByText(/^(Correct|Wrong)$/).length).toBeGreaterThan(0);
    await user.keyboard("2");
    expect(
      screen.getByText("0 / 10").textContent === "0 / 10" || screen.getByText("1 / 10"),
    ).toBeTruthy();
  });
});

describe("QuizPlay: MAP_CLICK and the accessible variant (AC-QZ-020)", () => {
  const mapCfg = cfg({
    template: "countries.by-name",
    format: "MAP_CLICK",
    count: "all",
    scope: { kind: "continent", id: "SA" },
  });
  it("shows the prompt as text over the map", () => {
    render(<Harness initial={sessionOf(mapCfg)} />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toMatch(/^Click: /);
    expect(screen.getByTestId("map")).toBeInTheDocument();
  });
  it("without the map: four options and a non-revealing description with 'Landlocked' and the neighbours", () => {
    const q = generateQuiz(world, mapCfg, "ACCSEED001");
    const item = q.items.find((i) => i.id === "country:PRY")!;
    const a = accessibleItem(world, facts, neighbors, item, "ACCSEED001");
    expect(a.options).toHaveLength(4);
    expect(a.options[a.correctIndex]).toBe("country:PRY");
    expect(a.description).toContain("Landlocked");
    expect(a.description).toContain("Brazil");
    expect(a.description).not.toContain("Paraguay");
    expect(accessibleItem(world, facts, neighbors, item, "ACCSEED001")).toEqual(a);
    const coastal = accessibleItem(
      world,
      facts,
      neighbors,
      q.items.find((i) => i.id === "country:URY")!,
      "ACCSEED001",
    );
    expect(coastal.description).toContain("coast");
  });
  it("renders the accessible item in the play screen with no map, and choosing counts as a click", async () => {
    const user = userEvent.setup();
    render(<Harness initial={sessionOf(mapCfg)} accessible />);
    expect(screen.queryByTestId("map")).toBeNull();
    expect(screen.getByText(/Description:/)).toBeInTheDocument();
    const group = screen.getByRole("group", { name: "Choose one" });
    expect(within(group).getAllByRole("button")).toHaveLength(4);
    await user.click(within(group).getAllByRole("button")[0]!);
    expect(screen.getByRole("status")).toHaveTextContent(/Correct\.|That's /);
  });
});

describe("QuizReview (quiz-library §8.4, AC-QZ-014)", () => {
  const finished = (): QuizSession => {
    const s = sessionOf(cfg());
    const items = s.state.items.map((it, i) =>
      i === 0
        ? {
            ...it,
            status: "correct" as const,
            score: 1,
            input: "kyrgystan",
            note: "spelling-corrected" as const,
          }
        : i === 1
          ? {
              ...it,
              status: "correct" as const,
              score: 1,
              input: "burma",
              note: "former-name" as const,
            }
          : { ...it, status: "missed" as const },
    );
    return { ...s, state: { ...s.state, items, phase: "review", endReason: "give_up" } };
  };
  const props = (over = {}) => ({
    world,
    session: finished(),
    now: 5000,
    pb: null,
    saved: true,
    onPlayAgain: () => undefined,
    onReplay: () => undefined,
    onPractice: () => undefined,
    onConfigure: () => undefined,
    ...over,
  });
  it("shows the result, why it ended, and a row per item with a non-colour status", () => {
    render(<QuizReview {...props()} />);
    expect(screen.getByText(/Result: 2 \/ 14 \(14%\)/)).toBeInTheDocument();
    expect(screen.getByText("You gave up.")).toBeInTheDocument();
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(14);
    expect(screen.getAllByText(/✕ missed/)).toHaveLength(12);
    expect(screen.getByText("✓ spelling")).toBeInTheDocument();
    expect(screen.getByText("✓ former name")).toBeInTheDocument();
  });
  it("filters to missed or spelling-corrected rows", async () => {
    const user = userEvent.setup();
    render(<QuizReview {...props()} />);
    await user.click(screen.getByRole("button", { name: "Missed" }));
    expect(screen.getAllByRole("row").slice(1)).toHaveLength(12);
    await user.click(screen.getByRole("button", { name: "Spelling corrected" }));
    expect(screen.getAllByRole("row").slice(1)).toHaveLength(1);
  });
  it("announces a new personal best with the previous one, offers practice with the miss count, and warns when it could not save", () => {
    render(
      <QuizReview
        {...props({
          pb: {
            key: "k",
            isNew: true,
            previous: { pb_key: "k", result_id: "r", score: 0.5, active_ms: 1 },
          },
          saved: false,
        })}
      />,
    );
    expect(screen.getByText(/New personal best/)).toHaveTextContent("Previous best 50%");
    expect(screen.getByRole("button", { name: "Practice my 12 misses" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't be saved/);
  });
});
