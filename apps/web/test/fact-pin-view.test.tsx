// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@meridian/fact-pin";
import type { Fact } from "@meridian/schemas";
import { FactPinView } from "../components/fact-pin/FactPinView";
import { assembleFactPin, searchPlaces } from "../lib/fact-pin/data";
import { newDailySession, type FactSession } from "../lib/fact-pin/session";

afterEach(cleanup);

const mk = (n: number, label: string, at: [number, number], extra: Partial<Fact> = {}): Fact =>
  ({
    id: `fact:${n}`,
    text: `A fact number ${n} that is long enough to read as a clue.`,
    answer_label: label,
    category: "history",
    era: "modern",
    precision: "city",
    target: { type: "point", coords: at },
    tolerance_km: 50,
    reveal: `It happened in ${label}.`,
    sources: [
      { title: `Source for ${label}`, url: "https://example.org/a", license: "CC BY-SA 4.0" },
    ],
    difficulty: 0.5,
    entities: [],
    status: "published",
    reviewed_at: "2026-01-01",
    review_due: null,
    continent: "AS",
    ...extra,
  }) as Fact;

const facts = [
  mk(1, "Kyoto", [35.0116, 135.7681], { generated: true }),
  mk(2, "Osaka", [34.6937, 135.5023], { generated: true }),
];
const empty = {
  type: "Topology",
  objects: { countries: { type: "GeometryCollection", geometries: [] } },
  arcs: [],
};
const data = assembleFactPin({
  facts: { facts },
  countries: { entities: [] },
  topology: empty as never,
});

function Harness({ initial }: { initial: FactSession }) {
  const [s, set] = useState(initial);
  return (
    <FactPinView
      data={data}
      session={s}
      now={0}
      clock={() => 0}
      onChange={set}
      onPlayAgain={() => undefined}
      onShare={() => undefined}
    />
  );
}
const start = (): FactSession =>
  newDailySession(DEFAULT_CONFIG, ["fact:1", "fact:2"], "2026-11-01", 0, 0);

describe("Fact Pin view", () => {
  it("AC-FP-005: placing a pin does not reveal; Confirm does", async () => {
    const user = userEvent.setup();
    render(<Harness initial={start()} />);
    expect(screen.getByRole("button", { name: "Confirm pin" })).toBeDisabled();
    await user.type(screen.getByLabelText("Or type a place"), "Kyo");
    await user.click(within(screen.getByRole("list", { name: "Places" })).getByText("Kyoto"));
    expect(screen.queryByText(/Answer:/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Confirm pin" }));
    expect(screen.getByText("Answer: Kyoto")).toBeTruthy();
  });

  it("AC-FP-011: a reveal shows the source with its title as a link", async () => {
    const user = userEvent.setup();
    render(<Harness initial={start()} />);
    await user.type(screen.getByLabelText("Or type a place"), "Kyoto{Enter}{Enter}");
    const link = screen.getByRole("link", { name: /Source for Kyoto/ });
    expect(link.getAttribute("href")).toBe("https://example.org/a");
  });

  it("AC-FP-012: keyboard only, type, select with Enter, Enter again confirms and scores", async () => {
    const user = userEvent.setup();
    render(<Harness initial={start()} />);
    await user.type(screen.getByLabelText("Or type a place"), "Kyoto{Enter}");
    expect(screen.getByText(/Pin placed/)).toBeTruthy();
    await user.keyboard("{Enter}");
    expect(screen.getByText("1000 of 1000")).toBeTruthy();
  });

  it("AC-FP-016: after the last fact the summary has the total, rows, play again and share", async () => {
    const user = userEvent.setup();
    render(<Harness initial={start()} />);
    await user.type(screen.getByLabelText("Or type a place"), "Kyoto{Enter}{Enter}");
    await user.click(screen.getByRole("button", { name: "Next fact" }));
    await user.type(screen.getByLabelText("Or type a place"), "Kyoto{Enter}{Enter}");
    await user.click(screen.getByRole("button", { name: "See your summary" }));
    expect(screen.getByText(/of 2000/)).toBeTruthy();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("button", { name: "Play again" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share result" })).toBeTruthy();
  });

  it("the continent hint shows the continent and the cap", async () => {
    const user = userEvent.setup();
    render(<Harness initial={start()} />);
    await user.click(screen.getByRole("button", { name: /Show the continent/ }));
    expect(screen.getByText(/Asia/)).toBeTruthy();
    await user.type(screen.getByLabelText("Or type a place"), "Kyoto{Enter}{Enter}");
    expect(screen.getByText("700 of 1000")).toBeTruthy();
  });
});

describe("place search", () => {
  it("matches word prefixes and ignores one-letter input", () => {
    expect(searchPlaces(data.places, "k")).toEqual([]);
    expect(searchPlaces(data.places, "osa").map((p) => p.name)).toEqual(["Osaka"]);
  });
});
