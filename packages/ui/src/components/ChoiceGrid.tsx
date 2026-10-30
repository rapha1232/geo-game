"use client";

import { useEffect, type ReactNode } from "react";
import { cx } from "./cx";
import styles from "./ChoiceGrid.module.css";

/** Feedback state of an option. Each state has a glyph and a pattern, never colour alone. */
export type ChoiceState = "idle" | "correct" | "wrong" | "near";

export type Choice = {
  id: string;
  label: ReactNode;
  /** Plain-text name for assistive tech when `label` is an image. */
  accessibleName?: string;
  state?: ChoiceState;
  disabled?: boolean;
};

export type ChoiceGridProps = {
  choices: readonly Choice[];
  onChoose: (id: string) => void;
  "aria-label": string;
  /** Spoken names of the feedback states (translated by the caller). */
  stateLabels: Record<Exclude<ChoiceState, "idle">, string>;
  /** Enable the 1–9 number-key shortcuts (only when there are at most 9 options). */
  shortcuts?: boolean;
};

const GLYPH: Record<Exclude<ChoiceState, "idle">, string> = { correct: "✓", wrong: "✕", near: "◐" };

function isTextEntry(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.isContentEditable ||
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT"
  );
}

export function ChoiceGrid({
  choices,
  onChoose,
  stateLabels,
  shortcuts = true,
  ...rest
}: ChoiceGridProps) {
  if (choices.length < 2 || choices.length > 16)
    throw new RangeError("ChoiceGrid takes 2–16 options");
  const numbered = shortcuts && choices.length <= 9;

  useEffect(() => {
    if (!numbered) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || isTextEntry(e.target)) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > choices.length) return;
      const choice = choices[n - 1];
      if (choice && !choice.disabled) {
        e.preventDefault();
        onChoose(choice.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [numbered, choices, onChoose]);

  return (
    <div
      role="group"
      aria-label={rest["aria-label"]}
      className={styles.grid}
      data-cols={choices.length > 8 ? "wide" : choices.length > 4 ? "mid" : "narrow"}
    >
      {choices.map((c, i) => {
        const state = c.state ?? "idle";
        return (
          <button
            key={c.id}
            type="button"
            className={cx(styles.choice, styles[state])}
            disabled={c.disabled}
            data-state={state}
            aria-keyshortcuts={numbered ? String(i + 1) : undefined}
            onClick={() => onChoose(c.id)}
          >
            {numbered && (
              <kbd className={styles.key} aria-hidden="true">
                {i + 1}
              </kbd>
            )}
            <span className={styles.label}>{c.label}</span>
            {state !== "idle" && (
              <>
                <span aria-hidden="true" className={styles.glyph}>
                  {GLYPH[state]}
                </span>
                <span className="visually-hidden">{stateLabels[state]}</span>
              </>
            )}
            {c.accessibleName && <span className="visually-hidden">{c.accessibleName}</span>}
          </button>
        );
      })}
    </div>
  );
}
