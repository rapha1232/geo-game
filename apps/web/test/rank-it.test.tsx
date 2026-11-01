// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { RankItView } from "../components/rank-it/RankItView";
import { assembleRankIt, type RankItPacks } from "../lib/rank-it/data";
import { DEFAULT_CONFIG, newSession, type Session } from "../lib/rank-it/controller";

afterEach(cleanup);

const stat = (id: string, source: string) => ({
  id,
  label: id,
  unit: "people",
  sort: "desc" as const,
  separation: { relative: 0.1 },
  decimals: 0,
  source_id: "wb",
  source_note: source,
});
const packs: RankItPacks = {
  countries: {
    entities: Array.from({ length: 30 }, (_, i) => ({
      id: `country:C${String(i).padStart(2, "0")}`,
      names: { canonical: `Country ${i}` },
      parent_ids: ["continent:EU"],
      sets: ["sovereign-197"],
      difficulty: { fam: 0.9 },
    })),
  },
  indicators: {
    stats: [stat("population", "World Bank test")],
    values: {
      population: Object.fromEntries(
        Array.from({ length: 30 }, (_, i) => [
          `country:C${String(i).padStart(2, "0")}`,
          [Math.round(1000 * 1.6 ** i), 2023 + (i % 2)] as [number, number],
        ]),
      ),
    },
  },
};
const data = assembleRankIt(packs);

function Harness({ initial, format = "order" as const }: { initial?: Session; format?: string }) {
  const [s, set] = useState(
    initial ??
      newSession(data.world, "SEED", {
        ...DEFAULT_CONFIG,
        stat: "population",
        format: format as never,
      }),
  );
  return <RankItView session={s} world={data.world} onChange={set} onConfig={() => undefined} />;
}
const order = () => screen.getAllByRole("button", { name: /position \d of 5/ });
const names = () =>
  screen.getByRole("list", { name: "Countries to order" }).querySelectorAll("li .name").length;

describe("Rank It view", () => {
  it("AC-RK-006 Space, ArrowUp, Space moves an item up one place and announces it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const before = order().map((b) => b.getAttribute("aria-label")!.split(",")[0]);
    order()[2]!.focus();
    await user.keyboard(" ");
    await user.keyboard("{ArrowUp}");
    await user.keyboard(" ");
    const after = order().map((b) => b.getAttribute("aria-label")!.split(",")[0]);
    expect(after[1]).toBe(before[2]);
    expect(after[2]).toBe(before[1]);
    expect(
      screen.getByText(/moved to position 2 of 5|dropped at position 2 of 5/),
    ).toBeInTheDocument();
    expect(names()).toBe(5);
  });

  it("the Move buttons reorder without dragging", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const before = order().map((b) => b.getAttribute("aria-label")!.split(",")[0]);
    await user.click(screen.getByRole("button", { name: `Move ${before[0]} down` }));
    expect(order().map((b) => b.getAttribute("aria-label")!.split(",")[0])[1]).toBe(before[0]);
  });

  it("AC-RK-007 the reveal shows true values, marks each row with an icon and states the source and years", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Submit order" }));
    expect(screen.getByText(/Your score: \d+ of 100/)).toBeInTheDocument();
    expect(screen.getByText(/Values: World Bank test\. Years: 20\d\d/)).toBeInTheDocument();
    const rows = within(screen.getByRole("list", { name: "Countries to order" })).getAllByRole(
      "listitem",
    );
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => /✓|✕/.test(r.textContent ?? ""))).toBe(true);
  });

  it("the hint says where one item belongs and can be used once", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Hint (−20 points)" }));
    expect(screen.getByText(/belongs in position \d\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hint (−20 points)" })).toBeDisabled();
  });

  it("Higher or lower: a pick extends or ends the streak", async () => {
    const user = userEvent.setup();
    render(<Harness format="higher-lower" />);
    expect(screen.getByText("Streak: 0")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Higher" }));
    const wrongOrRight =
      screen.queryByText("Streak: 1") ?? screen.queryByText(/Run over after 0 correct\./);
    expect(wrongOrRight).not.toBeNull();
  });

  it("Top picks: five picks fill the round and reveal shows the top five", async () => {
    const user = userEvent.setup();
    render(<Harness format="top-picks" />);
    const cells = within(screen.getByRole("list", { name: "Countries" })).getAllByRole("button");
    expect(cells).toHaveLength(16);
    for (const c of cells.slice(0, 6)) await user.click(c);
    expect(screen.getByText(/5 of 5 picked/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reveal" }));
    expect(screen.getByText(/Your score: \d+ of 15/)).toBeInTheDocument();
    expect(screen.getByText("The top 5, highest first:")).toBeInTheDocument();
  });
});
