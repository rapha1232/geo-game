// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoadFailure, LoadingState } from "../components/shell/LoadState";
import { ServicesContext } from "../components/shell/StorageProvider";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const withServices = (online: boolean, ui: React.ReactNode) => (
  <ServicesContext.Provider value={{ online } as never}>{ui}</ServicesContext.Provider>
);

describe("LoadingState", () => {
  beforeEach(() => vi.useFakeTimers());
  it("shows nothing for the first 300 ms, then the message", () => {
    render(<LoadingState>Loading the map data…</LoadingState>);
    expect(screen.queryByText("Loading the map data…")).toBeNull();
    act(() => void vi.advanceTimersByTime(299));
    expect(screen.queryByText("Loading the map data…")).toBeNull();
    act(() => void vi.advanceTimersByTime(2));
    expect(screen.getByText("Loading the map data…")).toBeTruthy();
  });
});

describe("LoadFailure", () => {
  it("AC-PL-014: online it offers Retry", () => {
    const retry = vi.fn();
    render(withServices(true, <LoadFailure message="The map data didn't load." onRetry={retry} />));
    expect(screen.getByText("The map data didn't load.")).toBeTruthy();
    screen.getByRole("button", { name: "Try again" }).click();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("AC-PL-014: offline it says the game is available when you're back online, and retries by itself on reconnect", () => {
    const retry = vi.fn();
    const ui = (online: boolean) =>
      withServices(online, <LoadFailure message="The map data didn't load." onRetry={retry} />);
    const { rerender } = render(ui(false));
    expect(screen.getByText(/Available when you're back online/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(retry).not.toHaveBeenCalled();
    rerender(ui(true));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
