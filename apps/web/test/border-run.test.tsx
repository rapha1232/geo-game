// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { Topology } from "topojson-specification";
import { BorderRunView } from "../components/border-run/BorderRunView";
import { assembleBorderRun, type BorderRunPacks } from "../lib/border-run/data";
import { DEFAULT_CONFIG, newSession, type Session } from "../lib/border-run/controller";

afterEach(cleanup);

const names: [string, string, string][] = [
  ["ESP", "Spain", "EU"],
  ["FRA", "France", "EU"],
  ["DEU", "Germany", "EU"],
  ["POL", "Poland", "EU"],
  ["ITA", "Italy", "EU"],
  ["CHE", "Switzerland", "EU"],
  ["AUT", "Austria", "EU"],
  ["CZE", "Czechia", "EU"],
  ["GBR", "United Kingdom", "EU"],
  ["BEL", "Belgium", "EU"],
];
const e = (a: string, b: string) => ({ a: `country:${a}`, b: `country:${b}` });
const packs: BorderRunPacks = {
  countries: {
    entities: names.map(([id, name, continent]) => ({
      id: `country:${id}`,
      type: "country" as const,
      names: { canonical: name, aliases: [] },
      label_point: [0, 0] as [number, number],
      parent_ids: [`continent:${continent}`],
      sets: ["sovereign-197"],
    })),
  },
  adjacency: {
    edges: [
      e("ESP", "FRA"),
      e("DEU", "FRA"),
      e("DEU", "POL"),
      e("CHE", "FRA"),
      e("CHE", "DEU"),
      e("AUT", "DEU"),
      e("AUT", "ITA"),
      e("ITA", "FRA"),
      e("CZE", "DEU"),
      e("CZE", "POL"),
      e("BEL", "FRA"),
    ],
  },
  crossings: {
    crossings: [{ a: "country:FRA", b: "country:GBR", type: "tunnel", name: "Channel Tunnel" }],
  },
  ambiguity: { groups: [] },
  topology: {
    type: "Topology",
    objects: { countries: { type: "GeometryCollection", geometries: [] } },
    arcs: [],
  } as unknown as Topology,
};
const data = assembleBorderRun(packs);

function Harness({ initial }: { initial: Session }) {
  const [s, set] = useState(initial);
  return <BorderRunView session={s} data={data} onChange={set} onConfig={() => undefined} />;
}
const start = (): Session => {
  const s = newSession(data, "SEED", { ...DEFAULT_CONFIG, route: "easy", region: "EU" });
  // Spain to Poland, the spec's example, whichever pair the seed picked.
  return {
    ...s,
    round: { ...s.round, a: "country:ESP", b: "country:POL", m: 2 },
  };
};

describe("Border Run view", () => {
  it("AC-BR-013 announces the classification and the connected path after a guess", async () => {
    const user = userEvent.setup();
    render(<Harness initial={start()} />);
    await user.type(screen.getByLabelText("Country"), "France{Enter}");
    expect(
      screen.getAllByText(/France: on route\. Connected path: Spain, France\./)[0],
    ).toBeInTheDocument();
  });

  it("AC-BR-005 and AC-BR-006 say why a guess was refused and keep the counter", async () => {
    const user = userEvent.setup();
    render(<Harness initial={start()} />);
    await user.type(screen.getByLabelText("Country"), "Narnia{Enter}");
    expect(screen.getByText("Not a recognized country.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Country"), "Spain{Enter}");
    expect(screen.getByText("Spain is already on the map.")).toBeInTheDocument();
    expect(screen.getByText("Guess 1 of 6")).toBeInTheDocument();
  });

  it("AC-BR-002 shows the win, the score and the shortest route", async () => {
    const user = userEvent.setup();
    render(<Harness initial={start()} />);
    await user.type(screen.getByLabelText("Country"), "France{Enter}");
    await user.type(screen.getByLabelText("Country"), "Germany{Enter}");
    expect(screen.getByText("Connected in 2 guesses.")).toBeInTheDocument();
    expect(screen.getByText("10 points")).toBeInTheDocument();
    expect(screen.getByText("Spain → France → Germany → Poland")).toBeInTheDocument();
  });

  it("marks every guess with an icon and a word, not colour alone (AC-PL-008)", async () => {
    const user = userEvent.setup();
    render(<Harness initial={start()} />);
    await user.type(screen.getByLabelText("Country"), "Italy{Enter}");
    await user.type(screen.getByLabelText("Country"), "Switzerland{Enter}");
    expect(screen.getByText("Off route")).toBeInTheDocument();
    expect(screen.getByText("Close")).toBeInTheDocument();
  });

  it("reveals a hint and costs a guess for Reveal one", async () => {
    const user = userEvent.setup();
    render(<Harness initial={start()} />);
    await user.click(screen.getByRole("button", { name: "Reveal one" }));
    expect(screen.getByText("France is on a shortest route.")).toBeInTheDocument();
    expect(screen.getByText("Guess 2 of 6")).toBeInTheDocument();
  });
});

describe("Border Run content", () => {
  it("AC-BR-009 the Channel Tunnel joins the United Kingdom to the rest only when crossings are on", () => {
    expect(data.bw(false).graph.get("country:GBR")).toEqual([]);
    expect(data.bw(true).graph.get("country:GBR")).toEqual(["country:FRA"]);
  });
});
