"use client";

import type { ReactNode } from "react";
import { Dialog as AriaDialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { Button } from "./Button";
import styles from "./Dialog.module.css";

export type DialogProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Visible label of the close button (translated by the caller). */
  closeLabel: string;
  children: ReactNode;
};

/** Modal dialog with focus trap, Esc to close and focus restore (React Aria). */
export function Dialog({ isOpen, onOpenChange, title, closeLabel, children }: DialogProps) {
  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable
      className={styles.overlay ?? ""}
    >
      <Modal className={styles.modal ?? ""}>
        <AriaDialog className={styles.dialog ?? ""}>
          {({ close }) => (
            <>
              <Heading slot="title" className={styles.title ?? ""}>
                {title}
              </Heading>
              <div className={styles.body ?? ""}>{children}</div>
              <div className={styles.actions ?? ""}>
                <Button variant="secondary" onPress={close}>
                  {closeLabel}
                </Button>
              </div>
            </>
          )}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  );
}
