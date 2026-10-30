"use client";

import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components";
import { cx } from "./cx";
import styles from "./Button.module.css";

export type ButtonProps = Omit<AriaButtonProps, "className"> & {
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
};

export function Button({ variant = "secondary", className, ...props }: ButtonProps) {
  return <AriaButton {...props} className={cx(styles.button, styles[variant], className)} />;
}
