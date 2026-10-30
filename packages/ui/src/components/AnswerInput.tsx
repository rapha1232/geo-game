"use client";

import { useId, type KeyboardEvent } from "react";
import { cx } from "./cx";
import styles from "./AnswerInput.module.css";

export type AnswerStatusTone = "neutral" | "success" | "error" | "hint";

export type AnswerInputProps = {
  /** Visible label. Placeholders are never a substitute for a label. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Enter pressed. The engine decides what a submit means. */
  onSubmit: (value: string) => void;
  /** Inline status line below the field, announced politely. */
  status?: { tone: AnswerStatusTone; text: string } | null;
  disabled?: boolean;
  maxLength?: number;
  autoFocus?: boolean;
  /** Format hint such as "Type a country name". Placeholder only. */
  placeholder?: string;
};

const GLYPH: Record<AnswerStatusTone, string> = {
  neutral: "",
  success: "✓",
  error: "✕",
  hint: "ℹ",
};

/**
 * Shell of the answer field: no autocorrect or autocapitalize, an aria-live status line, and Enter to submit.
 * Matching itself lives in the name matcher; this component only reports text and Enter.
 */
export function AnswerInput({
  label,
  value,
  onChange,
  onSubmit,
  status,
  disabled,
  maxLength = 80,
  autoFocus,
  placeholder,
}: AnswerInputProps) {
  const id = useId();
  const statusId = `${id}-status`;

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onSubmit(value);
    }
  };

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        id={id}
        className={styles.input}
        type="text"
        inputMode="text"
        enterKeyHint="enter"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-describedby={statusId}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <p
        id={statusId}
        className={cx(styles.status, status && styles[status.tone])}
        aria-live="polite"
        role="status"
      >
        {status && status.text !== "" && (
          <>
            {GLYPH[status.tone] && (
              <span aria-hidden="true" className={styles.glyph}>
                {GLYPH[status.tone]}
              </span>
            )}
            {status.text}
          </>
        )}
      </p>
    </div>
  );
}
