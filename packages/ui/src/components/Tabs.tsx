"use client";

import type { ReactNode } from "react";
import { Tab, TabList, TabPanel, Tabs as AriaTabs } from "react-aria-components";
import styles from "./Tabs.module.css";

export type TabItem = { id: string; label: string; content: ReactNode };

export type TabsProps = {
  items: readonly TabItem[];
  "aria-label": string;
  defaultSelectedKey?: string;
};

export function Tabs({ items, defaultSelectedKey, ...rest }: TabsProps) {
  return (
    <AriaTabs className={styles.tabs ?? ""} {...(defaultSelectedKey ? { defaultSelectedKey } : {})}>
      <TabList className={styles.list ?? ""} aria-label={rest["aria-label"]}>
        {items.map((t) => (
          <Tab key={t.id} id={t.id} className={styles.tab ?? ""}>
            {t.label}
          </Tab>
        ))}
      </TabList>
      {items.map((t) => (
        <TabPanel key={t.id} id={t.id} className={styles.panel ?? ""}>
          {t.content}
        </TabPanel>
      ))}
    </AriaTabs>
  );
}
