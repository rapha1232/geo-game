import type { ComponentPropsWithoutRef, ElementType } from "react";
import { cx } from "./cx";
import styles from "./Card.module.css";

type CardProps<T extends ElementType> = { as?: T } & Omit<ComponentPropsWithoutRef<T>, "as">;

/** A surface with a 1 px border. Shadows are reserved for overlays. */
export function Card<T extends ElementType = "div">({ as, className, ...props }: CardProps<T>) {
  const Tag: ElementType = as ?? "div";
  return <Tag {...props} className={cx(styles.card, className as string | undefined)} />;
}
