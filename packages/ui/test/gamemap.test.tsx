import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Topology } from "topojson-specification";
import { GameMap, type GameMapLabels } from "../src/map/GameMap";

const box = (x: number, y: number, s: number): [number, number][] => [
  [x, y],
  [x + s, y],
  [x + s, y + s],
  [x, y + s],
  [x, y],
];
const topology: Topology = {
  type: "Topology",
  arcs: [box(-40, -10, 30), box(10, 0, 30)],
  objects: {
    countries: {
      type: "GeometryCollection",
      geometries: [
        { type: "Polygon", id: "country:AAA", arcs: [[0]] },
        { type: "Polygon", id: "country:BBB", arcs: [[1]] },
      ],
    },
  },
};
const labels: GameMapLabels = {
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  zoomReset: "Reset view",
  focused: (n) => `Focused: ${n}`,
  loupeHint: "Lift to choose",
  pinAt: (a, o) => `Pin at ${a}, ${o}`,
};
const entities = [
  { id: "country:AAA", name: "Aland", labelPoint: [5, -25] as const },
  { id: "country:BBB", name: "Bland", labelPoint: [15, 25] as const },
];
const base = { lods: { "110m": topology }, entities, labels, "aria-label": "World map" };

afterEach(cleanup);

describe("GameMap", () => {
  it("draws every feature and asks for a finer level of detail only when zoomed in", () => {
    const onNeedLod = vi.fn();
    const { container } = render(<GameMap {...base} mode="view" onNeedLod={onNeedLod} />);
    expect(container.querySelectorAll("path[data-id]").length).toBeGreaterThanOrEqual(2);
    expect(onNeedLod).not.toHaveBeenCalled();
    expect(container.querySelector("svg[aria-label='World map']")).not.toBeNull();
  });

  it("zoom buttons are real buttons with names, and + / 0 keys change the zoom (AC-PL-008 keyboard parity)", () => {
    const { container } = render(<GameMap {...base} mode="view" />);
    const root = container.querySelector("[data-zoom]") as HTMLElement;
    expect(root.dataset["zoom"]).toBe("1.00");
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(Number(root.dataset["zoom"])).toBeGreaterThan(1);
    fireEvent.keyDown(container.querySelector("svg[aria-label]") as Element, { key: "0" });
    expect(root.dataset["zoom"]).toBe("1.00");
  });

  it("states use patterns or outlines, never colour alone", () => {
    const { container } = render(
      <GameMap {...base} mode="view" states={{ "country:AAA": "wrong", "country:BBB": "near" }} />,
    );
    const fills = [...container.querySelectorAll("path[data-id]")].map((p) =>
      p.getAttribute("fill"),
    );
    expect(fills.some((f) => f?.startsWith("url(#"))).toBe(true);
    expect(container.querySelectorAll("pattern").length).toBeGreaterThanOrEqual(2);
  });

  it("free-pin mode moves the pin by keyboard and reports it", () => {
    const onPinChange = vi.fn();
    const { container } = render(
      <GameMap {...base} mode="free-pin" pin={null} onPinChange={onPinChange} />,
    );
    fireEvent.keyDown(container.querySelector("svg[aria-label]") as Element, { key: "ArrowRight" });
    expect(onPinChange).toHaveBeenCalledTimes(1);
    const pin = onPinChange.mock.calls[0]?.[0] as { lat: number; lon: number };
    expect(pin.lon).toBeGreaterThan(0);
  });
});
