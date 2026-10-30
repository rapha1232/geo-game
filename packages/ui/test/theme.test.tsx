import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  THEME_STORAGE_KEY,
  ThemeToggle,
  applyTheme,
  readThemePreference,
  saveThemePreference,
  themeInitScript,
} from "../src/index";

const labels = { system: "System", light: "Light", dark: "Dark" };

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});
afterEach(cleanup);

describe("theme preference", () => {
  it("defaults to system and ignores junk values", () => {
    expect(readThemePreference()).toBe("system");
    localStorage.setItem(THEME_STORAGE_KEY, "purple");
    expect(readThemePreference()).toBe("system");
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    expect(readThemePreference()).toBe("dark");
  });

  it("saves light and dark, and clears the key for system", () => {
    saveThemePreference("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    saveThemePreference("system");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("applies data-theme, and removes it for system", () => {
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    applyTheme("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("survives storage that throws (private windows, blocked site data)", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readThemePreference(broken)).toBe("system");
    expect(() => saveThemePreference("dark", broken)).not.toThrow();
    expect(() => saveThemePreference("system", broken)).not.toThrow();
  });
});

describe("head init script", () => {
  const run = () => new Function(themeInitScript)();

  it("applies a saved light or dark choice before paint", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    run();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("leaves the attribute off for system, junk values and missing storage", () => {
    run();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    localStorage.setItem(THEME_STORAGE_KEY, "system");
    run();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    localStorage.setItem(THEME_STORAGE_KEY, "<script>");
    run();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("never throws when storage is blocked", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(run).not.toThrow();
    spy.mockRestore();
  });

  it("agrees with readThemePreference for every stored value", () => {
    for (const v of ["light", "dark", "system", "nope"]) {
      localStorage.setItem(THEME_STORAGE_KEY, v);
      document.documentElement.removeAttribute("data-theme");
      run();
      const pref = readThemePreference();
      expect(document.documentElement.getAttribute("data-theme") ?? "system").toBe(pref);
    }
  });
});

describe("ThemeToggle", () => {
  it("is a labelled radio group with a selected state that is more than colour", async () => {
    render(<ThemeToggle label="Theme" optionLabels={labels} />);
    expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "System" })).toBeChecked();
  });

  it("applies and saves a choice, and restores the saved one on mount", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ThemeToggle label="Theme" optionLabels={labels} />);
    await user.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    unmount();
    render(<ThemeToggle label="Theme" optionLabels={labels} />);
    expect(await screen.findByRole("radio", { name: "Dark" })).toBeChecked();
  });

  it("works from the keyboard and returns to system", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle label="Theme" optionLabels={labels} />);
    await user.tab();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Light" })).toBeChecked();
    expect(document.documentElement.dataset.theme).toBe("light");
    await user.click(screen.getByRole("radio", { name: "System" }));
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("follows changes made in another tab", async () => {
    render(<ThemeToggle label="Theme" optionLabels={labels} />);
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY }));
    expect(await screen.findByRole("radio", { name: "Dark" })).toBeChecked();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
