// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { buildWorld, type SilEntity } from "@meridian/silhouette";
import { SilhouetteView } from "../components/silhouette/SilhouetteView";
import { newSession, type Session } from "../lib/silhouette/controller";
import type { Shape } from "../lib/silhouette/data";

afterEach(cleanup);

const mk = (
  id: string,
  name: string,
  ref: [number, number],
  extra: Partial<SilEntity> = {},
): SilEntity => ({
  id: `country:${id}`,
  name,
  aliases: [],
  type: "country",
  continent: "EU",
  areaKm2: 100_000,
  ref,
  shape: 0.3,
  sets: ["sovereign-197", "un-193"],
  capitals: [`${name} City`],
  remote: [],
  ...extra,
});
const entities = [
  mk("RUS", "Russia", [60, 90], { areaKm2: 17_000_000 }),
  mk("KAZ", "Kazakhstan", [48, 67], { continent: "AS" }),
  mk("GRC", "Greece", [39, 22]),
  mk("GRD", "Grenada", [12.1, -61.7], { continent: "NA", areaKm2: 344 }),
  mk("FRA", "France", [46.6, 2.5]),
  mk("ESP", "Spain", [40.2, -3.6]),
  mk("ITA", "Italy", [42, 12.5]),
];
const world = buildWorld(entities, [{ a: "country:KAZ", b: "country:RUS" }]);
const square: GeoJSON.Geometry = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [0, 10],
      [10, 10],
      [10, 0],
      [0, 0],
    ],
  ],
};
const shapes = new Map<string, Shape>(entities.map((e) => [e.id, { main: square, remote: null }]));

function Harness({ initial }: { initial: Session }) {
  const [s, set] = useState(initial);
  return <SilhouetteView session={s} world={world} shapes={shapes} onChange={set} />;
}
const start = (target = "country:RUS"): Session => {
  const s = newSession(world, "AAAAAAAAAA");
  return { ...s, round: { ...s.round, targetId: target } };
};

describe("SilhouetteView", () => {
  it("shows the shape with a non-revealing label and no country name", () => {
    render(<Harness initial={start()} />);
    expect(screen.getByRole("img")).toHaveAccessibleName(/silhouette/i);
    expect(screen.queryByText("Russia")).toBeNull();
  });

  it("AC-SH-006: an unrecognized guess shows a message and the counter stays at 1", async () => {
    const user = userEvent.setup();
    render(<Harness initial={start()} />);
    await user.type(screen.getByRole("textbox", { name: "Country or territory" }), "Narnia{Enter}");
    expect(screen.getByRole("status")).toHaveTextContent(/not a recognized/i);
    expect(screen.getByText("Guess 1 of 6")).toBeInTheDocument();
  });

  it("AC-SH-005/018: a neighbour's row shows the border marker and a screen-reader announcement", async () => {
    const user = userEvent.setup();
    render(<Harness initial={start()} />);
    await user.type(
      screen.getByRole("textbox", { name: "Country or territory" }),
      "Kazakhstan{Enter}",
    );
    const row = screen.getByRole("list", { name: "Silhouette" }).querySelector("li") as HTMLElement;
    expect(within(row).getAllByText(/Shares a border/).length).toBeGreaterThanOrEqual(2);
    expect(row).toHaveTextContent(/Guess 1 of 6: Kazakhstan\./);
    expect(row).toHaveTextContent(/kilometres, .*, \d+ percent\. Shares a border\./);
    expect(screen.getByText("Guess 2 of 6")).toBeInTheDocument();
  });

  it("AC-SH-020: suggestions appear after one letter and picking one submits it", async () => {
    const user = userEvent.setup();
    render(<Harness initial={start()} />);
    await user.type(screen.getByRole("textbox", { name: "Country or territory" }), "gr");
    const list = screen.getByRole("list", { name: "Suggestions" });
    expect(
      within(list)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Greece", "Grenada"]);
    await user.click(within(list).getByRole("button", { name: "Grenada" }));
    expect(screen.getByText(/Guess 1 of 6: Grenada\./)).toBeInTheDocument();
  });

  it("hints open once, show their content, and have text labels", async () => {
    const user = userEvent.setup();
    render(<Harness initial={start("country:FRA")} />);
    await user.click(screen.getByRole("button", { name: "Continent" }));
    expect(screen.getByText("Europe")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continent" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "First letter" }));
    expect(screen.getByText(/Starts with F/)).toBeInTheDocument();
  });

  it("a correct guess shows follow-ups, then the Learn card, then the next round", async () => {
    const user = userEvent.setup();
    render(<Harness initial={start("country:FRA")} />);
    await user.type(screen.getByRole("textbox", { name: "Country or territory" }), "france{Enter}");
    expect(
      screen.getByRole("heading", { name: /Solved in 1\. The answer is France\./ }),
    ).toBeInTheDocument();
    const groups = screen.getAllByRole("group");
    expect(groups).toHaveLength(2);
    await user.click(within(groups[0]!).getByRole("button", { name: "France City" }));
    expect(screen.getByRole("status")).toHaveTextContent(/Correct/);
    await user.click(within(groups[1]!).getAllByRole("button")[0]!);
    expect(screen.getByRole("heading", { name: "About France" })).toBeInTheDocument();
    expect(screen.getByText(/Distances are measured between the points shown/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next round" }));
    expect(
      screen.getByText("Round 2 · 7 points".replace("7", String(7 - 1 + 1 - 0))),
    ).toBeInTheDocument();
  });

  it("giving up reveals the answer", async () => {
    const user = userEvent.setup();
    render(<Harness initial={start("country:ESP")} />);
    await user.click(screen.getByRole("button", { name: "Give up" }));
    expect(
      screen.getByRole("heading", { name: /Not this time\. The answer is Spain\./ }),
    ).toBeInTheDocument();
  });
});
