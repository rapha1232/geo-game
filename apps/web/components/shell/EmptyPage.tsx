import type { ReactNode } from "react";
import styles from "./shell.module.css";

/** Placeholder for a route whose feature lands in a later task: explains and offers an action (UX_AND_DESIGN §8). */
export function EmptyPage({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <section className={styles.empty}>
      <h1>{title}</h1>
      <p>{body}</p>
      {children}
    </section>
  );
}
