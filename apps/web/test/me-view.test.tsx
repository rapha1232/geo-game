// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { MeView } from "../components/me/MeView";
import { ulid } from "../lib/results/ulid";
import { silhouetteResult } from "../lib/results/silhouette";
import { DEFAULT_CONFIG, answer, guess, newSession, surrender } from "../lib/silhouette/controller";
import { world } from "./fixtures/mini-world";

afterEach(cleanup);
const T0 = Date.parse("2026-11-05T08:00:00Z");
const solved = (i: number) => {
  let s = newSession(
    world,
    `K${String(i).padStart(9, "0")}`,
    DEFAULT_CONFIG,
    [],
    T0 + i * 3_600_000,
  );
  s = guess(world, s, world.byId.get(s.round.targetId)!.name, T0 + i * 3_600_000 + 20_000);
  s = answer(s, 0, s.followUps[0]!.prompt.correctIndex);
  s = answer(s, 1, s.followUps[1]!.prompt.correctIndex);
  return silhouetteResult(s, {
    id: ulid(T0 + i, new Uint8Array(16).fill(i)),
    contentVersion: "2026.10.0",
    endedAt: T0 + i * 3_600_000 + 30_000,
  });
};
const gaveUp = () => {
  let s = newSession(world, "MMMMMMMMMM", { ...DEFAULT_CONFIG, followUps: [] }, [], T0);
  s = surrender(world, s, T0 + 4000);
  return silhouetteResult(s, {
    id: ulid(T0 + 99, new Uint8Array(16).fill(99)),
    contentVersion: "2026.10.0",
    endedAt: T0 + 5000,
  });
};

describe("MeView", () => {
  it("AC-PL-010: after one round it says '1 round', with no sign-in anywhere", () => {
    render(<MeView results={[solved(0)]} />);
    expect(screen.getByText("1 round")).toBeInTheDocument();
    expect(screen.queryByText(/sign in/i)).toBeNull();
    expect(screen.getByRole("heading", { name: "Silhouette" })).toBeInTheDocument();
  });
  it("shows an empty state that points to a game when there are no results", () => {
    render(<MeView results={[]} />);
    expect(screen.getByText(/No rounds yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Play Silhouette" })).toHaveAttribute(
      "href",
      "/play/silhouette",
    );
  });
  it("shows per-game stats with a text version of the trend", () => {
    render(<MeView results={[solved(0), solved(1), gaveUp()]} />);
    expect(screen.getByText("3 rounds")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Scores of the last 3 rounds/ })).toBeInTheDocument();
    expect(screen.getByText("67%")).toBeInTheDocument();
  });
  it("filters the history by outcome", async () => {
    const user = userEvent.setup();
    render(<MeView results={[solved(0), solved(1), gaveUp()]} />);
    const list = () => screen.getByRole("list", { name: "" }) ?? null;
    void list;
    expect(document.querySelectorAll("ol li")).toHaveLength(3);
    await user.selectOptions(screen.getByLabelText("Outcome"), "gave_up");
    const items = document.querySelectorAll("ol li");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent("Gave up");
    await user.selectOptions(screen.getByLabelText("Game"), "silhouette");
    expect(within(items[0] as HTMLElement).getByText("2026-11-05")).toBeInTheDocument();
  });
});
