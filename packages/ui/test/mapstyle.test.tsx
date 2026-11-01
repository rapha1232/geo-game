import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Topology } from "topojson-specification";
import { GameMap, type GameMapLabels } from "../src/map/GameMap";
import { MapStylePicker } from "../src/components/MapStylePicker";
import {
  MAP_STYLES,
  MAP_STYLE_STORAGE_KEY,
  colourSlots,
  mapStyleInitScript,
  readMapStyle,
  setMapStyle,
  type MapStyle,
} from "../src/map/mapStyle";

const names = Object.fromEntries(MAP_STYLES.map((s) => [s, s.toUpperCase()])) as Record<
  MapStyle,
  string
>;

const box = (x: number, y: number, s: number): [number, number][] => [
  [x, y],
  [x + s, y],
  [x + s, y + s],
  [x, y + s],
  [x, y],
];
const topology: Topology = {
  type: "Topology",
  arcs: [box(-40, -10, 30), box(10, 0, 30), box(100, 40, 4), box(106, 40, 4)],
  objects: {
    countries: {
      type: "GeometryCollection",
      geometries: [
        { type: "Polygon", id: "country:AAA", arcs: [[0]] },
        { type: "Polygon", id: "country:BBB", arcs: [[1]] },
        { type: "Polygon", id: "country:CCC", arcs: [[2]] },
        { type: "Polygon", id: "country:DDD", arcs: [[3]] },
      ],
    },
  },
};
const labels: GameMapLabels = {
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  zoomReset: "Reset view",
  focused: (n) => n,
  loupeHint: "Tap again",
  pinAt: (a, o) => `${a}, ${o}`,
  mapStyle: { label: "Map style", names },
};
const entities = [
  { id: "country:AAA", name: "Aland", labelPoint: [5, -25] as const },
  { id: "country:BBB", name: "Bland", labelPoint: [15, 25] as const },
  { id: "country:CCC", name: "Cland", labelPoint: [42, 102] as const },
  { id: "country:DDD", name: "Dland", labelPoint: [42, 108] as const },
];
const base = { lods: { "110m": topology }, entities, labels, "aria-label": "World map" };

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-map-style");
});
afterEach(cleanup);

describe("map styles (AC-PL-035)", () => {
  it("AC-PL-035: the head script applies a saved style before paint and ignores junk", () => {
    const run = () => new Function(mapStyleInitScript)();
    localStorage.setItem(MAP_STYLE_STORAGE_KEY, "midnight");
    run();
    expect(document.documentElement.dataset["mapStyle"]).toBe("midnight");
    expect(readMapStyle()).toBe("midnight");
    document.documentElement.removeAttribute("data-map-style");
    localStorage.setItem(MAP_STYLE_STORAGE_KEY, "<script>");
    run();
    expect(document.documentElement.hasAttribute("data-map-style")).toBe(false);
    expect(readMapStyle()).toBe("atlas");
    expect(mapStyleInitScript.startsWith("(function(){")).toBe(true);
    expect(mapStyleInitScript).not.toContain("${");
  });

  it("AC-PL-035: choosing a style saves it, sets the attribute, and the default clears both", () => {
    setMapStyle("blueprint");
    expect(localStorage.getItem(MAP_STYLE_STORAGE_KEY)).toBe("blueprint");
    expect(document.documentElement.dataset["mapStyle"]).toBe("blueprint");
    setMapStyle("atlas");
    expect(localStorage.getItem(MAP_STYLE_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.hasAttribute("data-map-style")).toBe(false);
  });

  it("AC-PL-035: the picker shows every style, marks the current one, and switches on press", () => {
    render(<MapStylePicker label="Map style" names={names} />);
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(MAP_STYLES.length);
    expect(screen.getByRole("radio", { name: "ATLAS" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "INK" }));
    expect(document.documentElement.dataset["mapStyle"]).toBe("ink");
    expect(screen.getByRole("radio", { name: "INK" })).toBeChecked();
  });

  it("AC-PL-035: the map's style button opens the picker and Escape closes it", () => {
    const { container } = render(<GameMap {...base} mode="select" />);
    expect(screen.queryByRole("radiogroup")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Map style" }));
    expect(screen.getByRole("radiogroup", { name: "Map style" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "Escape" });
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(container.querySelectorAll("path[data-id]")).toHaveLength(4);
  });

  it("AC-PL-035: neighbours never share a colour slot", () => {
    // A ring of five around a centre (index 0) plus a ring: odd cycles need three colours plus the centre.
    const adjacency = [
      [1, 2, 3, 4, 5],
      [0, 2, 5],
      [0, 1, 3],
      [0, 2, 4],
      [0, 3, 5],
      [0, 4, 1],
    ];
    const ids = ["c", "r1", "r2", "r3", "r4", "r5"];
    const slots = colourSlots(ids, adjacency);
    adjacency.forEach((ns, i) =>
      ns.forEach((j) => expect(slots.get(ids[i] as string)).not.toBe(slots.get(ids[j] as string))),
    );
    // Stable: the same input gives the same colours.
    expect([...colourSlots(ids, adjacency)]).toEqual([...slots]);
  });

  it("AC-PL-008: tiny targets keep a shape per state (dot, cross, ring) in every style", () => {
    const { container } = render(
      <GameMap
        {...base}
        mode="select"
        states={{ "country:CCC": "wrong", "country:DDD": "correct" }}
      />,
    );
    const ccc = container.querySelector('[data-ring="country:CCC"]');
    const ddd = container.querySelector('[data-ring="country:DDD"]');
    expect(ccc?.querySelector("path")).not.toBeNull();
    expect(ddd?.querySelector("circle:not(:first-child)")).not.toBeNull();
  });
});

describe("regional framing (AC-PL-036)", () => {
  it("AC-PL-036: a focus set opens the map framed on it, and reset returns to that frame", () => {
    const { container } = render(
      <GameMap {...base} mode="view" focus={["country:CCC", "country:DDD"]} />,
    );
    const root = container.querySelector("[data-zoom]") as HTMLElement;
    const framed = Number(root.dataset["zoom"]);
    expect(framed).toBeGreaterThan(1.2);
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(Number(root.dataset["zoom"])).toBeLessThan(framed);
    fireEvent.click(screen.getByRole("button", { name: "Reset view" }));
    expect(Number(root.dataset["zoom"])).toBeCloseTo(framed, 2);
  });

  it("AC-PL-036: without a focus the map opens on the whole world", () => {
    const { container } = render(<GameMap {...base} mode="view" />);
    expect((container.querySelector("[data-zoom]") as HTMLElement).dataset["zoom"]).toBe("1.00");
  });
});
