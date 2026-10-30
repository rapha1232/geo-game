import type { ReactNode } from "react";
import styles from "./Prose.module.css";

export type Section = {
  heading: string;
  paragraphs?: readonly string[];
  bullets?: readonly string[];
};

/** Long-form page frame: one h1, readable measure, headings in order (AC-PL-004). */
export function Prose({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <article className={styles.prose}>
      <h1>{title}</h1>
      {meta && <p className={styles.meta}>{meta}</p>}
      {children}
    </article>
  );
}

export function Sections({ sections }: { sections: readonly Section[] }) {
  return sections.map((s) => (
    <section key={s.heading}>
      <h2>{s.heading}</h2>
      {s.paragraphs?.map((p) => (
        <p key={p}>{p}</p>
      ))}
      {s.bullets && (
        <ul>
          {s.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
    </section>
  ));
}
