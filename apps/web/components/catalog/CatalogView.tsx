"use client";

import { useMemo, useState } from "react";
import { Button, Card } from "@meridian/ui";
import {
  EMPTY_FILTER,
  isFiltered,
  searchCatalog,
  type CatalogFilter,
  type CatalogFormat,
  type CatalogItem,
  type CatalogState,
  type LengthBucket,
  type Region,
  type Sort,
  type Topic,
} from "../../lib/catalog/catalog";
import { t, type MessageKey } from "../../lib/i18n";
import styles from "./catalog.module.css";

const TOPICS: Topic[] = ["countries", "capitals", "flags", "regions"];
const FORMATS: CatalogFormat[] = ["Type", "Map", "Choice", "Deduction"];
const LENGTHS: LengthBucket[] = ["short", "medium", "long", "endless"];
const REGIONS: Region[] = ["AF", "AS", "EU", "NA", "OC", "SA"];

export type CatalogViewProps = {
  items: readonly CatalogItem[];
  state: CatalogState;
  onToggleFavorite: (key: string, on: boolean) => void;
};

function Chips<T extends string>({
  label,
  value,
  options,
  show,
  onChange,
}: {
  label: string;
  value: T | "";
  options: readonly T[];
  show: (v: T) => string;
  onChange: (v: T | "") => void;
}) {
  return (
    <div role="group" aria-label={label} className={styles.chips}>
      <span className={styles.chipLabel}>{label}</span>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          className={styles.chip}
          onClick={() => onChange(value === o ? "" : o)}
        >
          {show(o)}
        </button>
      ))}
    </div>
  );
}

/** `/play`: search, combinable filter chips, favorites and sort (UX_AND_DESIGN §3.2). Pure over its props. */
export function CatalogView({ items, state, onToggleFavorite }: CatalogViewProps) {
  const [f, setF] = useState<CatalogFilter>(EMPTY_FILTER);
  const [sort, setSort] = useState<Sort>("recommended");
  const results = useMemo(() => searchCatalog(items, f, state, sort), [items, f, state, sort]);
  const active = [
    f.search.trim() && `“${f.search.trim()}”`,
    f.topic && t(`cat.topic.${f.topic}` as MessageKey),
    f.format,
    f.length && t(`cat.length.${f.length}` as MessageKey),
    f.region && t(`cat.region.${f.region}` as MessageKey),
    f.favoritesOnly && t("cat.favoritesOnly"),
  ].filter(Boolean) as string[];
  return (
    <section className={styles.page}>
      <h1>{t("nav.play")}</h1>
      <div className={styles.controls}>
        <label className={styles.search}>
          {t("cat.search")}
          <input
            type="search"
            value={f.search}
            onChange={(e) => setF({ ...f, search: e.target.value })}
          />
        </label>
        <label className={styles.sort}>
          {t("cat.sort")}
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            {(["recommended", "az", "recent"] as const).map((s) => (
              <option key={s} value={s}>
                {t(`cat.sort.${s}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Chips
        label={t("cat.topic")}
        value={f.topic}
        options={TOPICS}
        show={(v) => t(`cat.topic.${v}` as MessageKey)}
        onChange={(topic) => setF({ ...f, topic })}
      />
      <Chips
        label={t("cat.format")}
        value={f.format}
        options={FORMATS}
        show={(v) => v}
        onChange={(format) => setF({ ...f, format })}
      />
      <Chips
        label={t("cat.length")}
        value={f.length}
        options={LENGTHS}
        show={(v) => t(`cat.length.${v}` as MessageKey)}
        onChange={(length) => setF({ ...f, length })}
      />
      <Chips
        label={t("cat.region")}
        value={f.region}
        options={REGIONS}
        show={(v) => t(`cat.region.${v}` as MessageKey)}
        onChange={(region) => setF({ ...f, region })}
      />
      <label className={styles.check}>
        <input
          type="checkbox"
          checked={f.favoritesOnly}
          onChange={(e) => setF({ ...f, favoritesOnly: e.target.checked })}
        />
        {t("cat.favoritesOnly")}
      </label>
      <p className={styles.count} role="status">
        {t("cat.results", { n: results.length })}
      </p>
      {results.length === 0 ? (
        <Card className={styles.empty}>
          <p>{t("cat.noMatch", { filters: active.join(" + ") })}</p>
          {isFiltered(f) && <Button onPress={() => setF(EMPTY_FILTER)}>{t("cat.clear")}</Button>}
        </Card>
      ) : (
        <ul className={styles.grid}>
          {results.map((i) => {
            const fav = state.favorites.has(i.key);
            return (
              <li key={i.key}>
                <Card as="article" className={styles.card}>
                  <div className={styles.cardHead}>
                    <h2>
                      <a href={i.href}>{i.title}</a>
                    </h2>
                    <button
                      type="button"
                      className={styles.star}
                      aria-pressed={fav}
                      aria-label={t(fav ? "cat.unfav" : "cat.fav", { title: i.title })}
                      onClick={() => onToggleFavorite(i.key, !fav)}
                    >
                      <span aria-hidden="true">{fav ? "★" : "☆"}</span>
                    </button>
                  </div>
                  <p className={styles.pitch}>{i.pitch}</p>
                  <p className={styles.meta}>
                    {t(i.kind === "game" ? "cat.game" : "cat.quiz")} · {i.format} ·{" "}
                    {t(`cat.length.${i.length}` as MessageKey)} ·{" "}
                    {state.played.has(i.key) ? t("cat.played") : t("cat.new")}
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
