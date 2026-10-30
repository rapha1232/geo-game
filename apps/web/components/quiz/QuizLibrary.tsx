"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@meridian/ui";
import type { Format, QuizWorld } from "@meridian/quiz";
import { assembleQuiz, loadQuizPacks } from "../../lib/quiz/data";
import {
  FORMAT_LABEL,
  defaultConfig,
  filterLibrary,
  itemCount,
  limitLabel,
  type Category,
} from "../../lib/quiz/library";
import { pbKey } from "@meridian/quiz";
import { t, type MessageKey } from "../../lib/i18n";
import { useServices } from "../shell/StorageProvider";
import styles from "./quiz.module.css";

const CATEGORIES: Category[] = ["countries", "capitals", "flags", "regions"];
const FORMATS: Format[] = ["TYPE_ALL", "TYPE_PROMPTED", "MAP_CLICK", "MULTIPLE_CHOICE"];

export type LibraryViewProps = {
  world: QuizWorld;
  /** Best score as a 0–1 fraction by PB key. */
  pbs: ReadonlyMap<string, number>;
};

/** The list, search and filters (quiz-library §8.1). Pure over its props, so it renders in tests without storage. */
export function LibraryView({ world, pbs }: LibraryViewProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category | "">("");
  const [format, setFormat] = useState<Format | "">("");
  const [maxMinutes, setMax] = useState<number | null>(null);
  const list = useMemo(
    () => filterLibrary(world, { search, category, format, maxMinutes }),
    [world, search, category, format, maxMinutes],
  );
  return (
    <section className={styles.page}>
      <h1>{t("qz.title")}</h1>
      <p className={styles.note}>{t("qz.blurb")}</p>
      <div className={styles.filters}>
        <label>
          {t("qz.search")}
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label>
          {t("qz.category")}
          <select value={category} onChange={(e) => setCategory(e.target.value as Category | "")}>
            <option value="">{t("qz.any")}</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`qz.cat.${c}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("qz.format")}
          <select value={format} onChange={(e) => setFormat(e.target.value as Format | "")}>
            <option value="">{t("qz.any")}</option>
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABEL[f]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("qz.length")}
          <select
            value={String(maxMinutes ?? "")}
            onChange={(e) => setMax(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{t("qz.any")}</option>
            <option value="3">{t("qz.under3")}</option>
            <option value="10">{t("qz.under10")}</option>
          </select>
        </label>
      </div>
      {list.length === 0 ? (
        <p>{t("qz.noResults")}</p>
      ) : (
        <ul className={styles.list}>
          {list.map((q) => {
            const c = defaultConfig(q);
            const n = itemCount(world, c);
            const key = pbKey(c, n);
            const pb = key ? pbs.get(key) : undefined;
            return (
              <li key={q.slug}>
                <Card as="article" className={styles.listItem}>
                  <h2>
                    <a href={`/play/quiz/${q.slug}`}>{q.title}</a>
                  </h2>
                  <p className={styles.note}>
                    {FORMAT_LABEL[q.format]} ·{" "}
                    {q.count === "all" ? t("qz.items", { n }) : t("qz.random", { n: q.count })} ·{" "}
                    {limitLabel(world, c)}
                  </p>
                  <p className={styles.pb}>
                    {pb === undefined
                      ? t("qz.noPb")
                      : t("qz.pb", { pb: `${Math.round(pb * 100)}%` })}
                  </p>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** `/play/quiz`: loads the content and the player's bests, then shows the library. */
export function QuizLibrary() {
  const services = useServices();
  const [world, setWorld] = useState<QuizWorld | null>(null);
  const [pbs, setPbs] = useState<Map<string, number>>(new Map());
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!services) return;
    let live = true;
    void (async () => {
      try {
        const { packs, edges } = await loadQuizPacks(services.loader);
        const rows = await services.db.pbs.toArray().catch(() => []);
        if (!live) return;
        setWorld(assembleQuiz(packs, edges).world);
        setPbs(new Map(rows.map((r) => [r.pb_key, r.score])));
      } catch {
        if (live) setError(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [services]);
  if (error)
    return (
      <p role="alert" className={styles.page}>
        {t("qz.loadError")}
      </p>
    );
  if (!world)
    return (
      <p role="status" className={styles.page}>
        {t("qz.loading")}
      </p>
    );
  return <LibraryView world={world} pbs={pbs} />;
}
