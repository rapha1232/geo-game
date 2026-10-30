"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cx } from "./cx";
import styles from "./Toast.module.css";

export type ToastKind = "info" | "success" | "error";

type ToastItem = { id: number; kind: ToastKind; message: string; timeoutMs: number };

type ToastApi = {
  show: (message: string, opts?: { kind?: ToastKind; timeoutMs?: number }) => number;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/** Redundant, non-colour markers for each kind. */
const GLYPH: Record<ToastKind, string> = { info: "ℹ", success: "✓", error: "✕" };

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}

export type ToastProviderProps = {
  children: ReactNode;
  /** Accessible name of the notifications region (translated by the caller). */
  regionLabel: string;
  /** Label of each toast's dismiss button (translated by the caller). */
  dismissLabel: string;
  defaultTimeoutMs?: number;
};

export function ToastProvider({
  children,
  regionLabel,
  dismissLabel,
  defaultTimeoutMs = 5000,
}: ToastProviderProps) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const show = useCallback<ToastApi["show"]>(
    (message, opts) => {
      const id = nextId.current++;
      const kind = opts?.kind ?? "info";
      setItems((xs) => [
        ...xs.slice(-3),
        {
          id,
          kind,
          message,
          timeoutMs:
            opts?.timeoutMs ?? (kind === "error" ? defaultTimeoutMs * 2 : defaultTimeoutMs),
        },
      ]);
      return id;
    },
    [defaultTimeoutMs],
  );
  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <section aria-label={regionLabel} className={styles.region}>
        {items.map((t) => (
          <ToastView key={t.id} item={t} dismissLabel={dismissLabel} onDismiss={dismiss} />
        ))}
      </section>
    </ToastContext.Provider>
  );
}

function ToastView({
  item,
  dismissLabel,
  onDismiss,
}: {
  item: ToastItem;
  dismissLabel: string;
  onDismiss: (id: number) => void;
}) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || item.timeoutMs <= 0) return;
    const h = setTimeout(() => onDismiss(item.id), item.timeoutMs);
    return () => clearTimeout(h);
  }, [paused, item.id, item.timeoutMs, onDismiss]);

  return (
    <div
      className={cx(styles.toast, styles[item.kind])}
      role={item.kind === "error" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span aria-hidden="true" className={styles.glyph}>
        {GLYPH[item.kind]}
      </span>
      <span className={styles.message}>{item.message}</span>
      <button
        type="button"
        className={styles.dismiss}
        aria-label={dismissLabel}
        onClick={() => onDismiss(item.id)}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
