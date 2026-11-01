"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GameMap, type Lod, type MapFeatureState } from "@meridian/ui";
import type { Topology } from "topojson-specification";
import { norm } from "@meridian/name-matcher";
import { t, type MessageKey } from "../../lib/i18n";
import {
  assembleAtlas,
  layerView,
  loadAtlasPacks,
  type AtlasWorld,
  type Place,
} from "../../lib/atlas/data";
import { LAYERS, layerById, type LayerId } from "../../lib/atlas/layers";
import { MAX_CLAUSES, matching, type Clause, type Op } from "../../lib/atlas/filter";
import {
  EMPTY_STATE,
  addCompare,
  parseState,
  removeCompare,
  stateToSearch,
  type AtlasState,
} from "../../lib/atlas/state";
import { markFactsSeen } from "../../lib/atlas/seen";
import { formatValue } from "../rank-it/RankItView";
import { LoadFailure, LoadingState } from "../shell/LoadState";
import { useServices } from "../shell/StorageProvider";
import styles from "./atlas.module.css";
import "../../lib/messages/at";
import "../../lib/messages/sil";

const LABELS = {
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  zoomReset: "Reset zoom",
  focused: (name: string) => name,
  loupeHint: "Tap again inside the circle",
  pinAt: (lat: number, lon: number) => `${lat}, ${lon}`,
};
const SOURCE: Record<string, MessageKey> = {
  wb: "at.src.wb",
  wd: "at.src.wd",
  ne: "at.src.ne",
};
const INDICATORS = LAYERS.filter((l) => l.kind === "indicator");
const OPS: Op[] = [">", "<", ">=", "<="];

const sourceName = (id: string): string => t(SOURCE[id] ?? "at.src.wd");

/** `/explore`: the reference map (atlas-explorer). Layers, filters, place cards, compare and a table view with the same powers. */
export function AtlasExplorer({ initialEntity }: { initialEntity?: string | null }) {
  const services = useServices();
  const [world, setWorld] = useState<AtlasWorld | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<AtlasState>(EMPTY_STATE);
  const [hover, setHover] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [discovered, setDiscovered] = useState<Set<string>>(new Set());
  const [showCompare, setShowCompare] = useState(false);
  const [sort, setSort] = useState<{ key: "place" | "value"; dir: 1 | -1 }>({
    key: "value",
    dir: -1,
  });
  const [lods, setLods] = useState<Partial<Record<Lod, Topology>>>({});
  const [notFound, setNotFound] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

  /** A card was opened: the place counts as discovered and its facts as seen (AC-AE-008, AC-AE-009). */
  const record = useCallback(
    (w: AtlasWorld, id: string) => {
      if (!services) return;
      void services.db.seen
        .put({ kind: "atlas", id })
        .then(() => setDiscovered((d) => new Set(d).add(id)))
        .catch(() => undefined);
      const facts = w.facts.get(id)?.map((f) => f.id) ?? [];
      if (facts.length > 0) void markFactsSeen(services.db, facts);
    },
    [services],
  );
  // Load packs, then read the URL (and the deep link) once.
  useEffect(() => {
    if (!services) return;
    let live = true;
    setError(false);
    void (async () => {
      try {
        const w = assembleAtlas(await loadAtlasPacks(services.loader));
        const seen = await services.db.seen
          .where("kind")
          .equals("atlas")
          .toArray()
          .catch(() => []);
        if (!live) return;
        const s = parseState(window.location.search, initialEntity ?? null);
        if (s.sel && !w.byId.has(s.sel)) {
          setNotFound(true);
          s.sel = null;
        }
        setWorld(w);
        setLods({ "110m": w.topology });
        setDiscovered(new Set(seen.map((x) => x.id)));
        setState(s);
        if (s.sel) record(w, s.sel);
      } catch {
        if (live) setError(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [services, attempt, initialEntity, record]);

  // Keep the URL in step with the state, so any view can be shared.
  useEffect(() => {
    if (!world) return;
    const path = window.location.pathname.startsWith("/explore/")
      ? "/explore"
      : window.location.pathname;
    window.history.replaceState(null, "", `${path}${stateToSearch(state)}`);
  }, [state, world]);

  const patch = useCallback((p: Partial<AtlasState>) => setState((s) => ({ ...s, ...p })), []);

  const open = useCallback(
    (id: string) => {
      patch({ sel: id });
      setNotFound(false);
      if (world) record(world, id);
    },
    [patch, world, record],
  );

  const compare = useCallback(
    (id: string) => {
      setState((s) => {
        const r = addCompare(s.compare, id);
        if (r.replaced)
          setToast(t("at.compare.replaced", { name: world?.byId.get(r.replaced)?.name ?? "" }));
        return { ...s, compare: r.list };
      });
    },
    [world],
  );

  // `/` focuses the search box; `C` adds the open place to compare.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        el && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA");
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if ((e.key === "c" || e.key === "C") && state.sel) {
        e.preventDefault();
        compare(state.sel);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.sel, compare]);

  const matchIds = useMemo(
    () =>
      world
        ? new Set(
            matching(
              state.filter,
              world.places.map((p) => p.id),
              world.lookup,
            ),
          )
        : new Set<string>(),
    [world, state.filter],
  );
  const view = useMemo(() => (world ? layerView(world, state.layer) : null), [world, state.layer]);
  const filtering = state.filter.length > 0;

  const mapStates = useMemo(() => {
    const out: Record<string, MapFeatureState> = { ...(view?.states ?? {}) };
    if (state.sel) out[state.sel] = "highlight";
    return out;
  }, [view, state.sel]);
  const dimmed = useMemo(
    () =>
      world && filtering
        ? new Set(world.places.filter((p) => !matchIds.has(p.id)).map((p) => p.id))
        : undefined,
    [world, filtering, matchIds],
  );

  if (error)
    return (
      <LoadFailure
        className={styles.page}
        message={t("at.loadError")}
        onRetry={() => setAttempt((n) => n + 1)}
      />
    );
  if (!world || !view)
    return <LoadingState className={styles.page}>{t("at.loading")}</LoadingState>;

  const layer = layerById(state.layer)!;
  const layerLabel = t(`at.layer.${state.layer}` as MessageKey);
  const stat = world.stats.get(state.layer);
  const nameOf = (id: string): string => world.byId.get(id)?.name ?? id;

  /** One line of text for a place on the current layer: value, source and year (AC-AE-001). */
  const describe = (id: string): string => {
    const name = nameOf(id);
    if (layer.kind === "indicator" && stat) {
      const v = world.value(state.layer, id);
      return v
        ? v[1] === null
          ? t("at.valueNoYear", {
              name,
              value:
                `${formatValue(stat, v[0])} ${stat.id === "capital-latitude" ? "" : stat.unit}`.trim(),
              source: sourceName(stat.source_id),
            })
          : t("at.value", {
              name,
              value:
                `${formatValue(stat, v[0])} ${stat.id === "capital-latitude" ? "" : stat.unit}`.trim(),
              source: sourceName(stat.source_id),
              year: v[1],
            })
        : t("at.noDataValue", { name, source: sourceName(stat.source_id) });
    }
    if (state.layer === "landlocked")
      return `${name}: ${world.byId.get(id)?.landlocked ? t("at.card.landlocked") : t("at.card.coastal")}`;
    return `${name}: ${t(`sil.continent.${world.byId.get(id)?.continent ?? "AF"}` as MessageKey)}`;
  };

  const found =
    query.trim().length >= 1
      ? world.places
          .filter(
            (p) =>
              norm(p.name).includes(norm(query)) ||
              (p.capital ? norm(p.capital).includes(norm(query)) : false),
          )
          .slice(0, 6)
      : [];

  const rows = world.places
    .filter((p) => matchIds.has(p.id))
    .flatMap((p) => {
      if (layer.kind !== "indicator")
        return [{ p, value: undefined as number | undefined, year: null as number | null }];
      const v = world.value(state.layer, p.id);
      return [{ p, value: v?.[0], year: v?.[1] ?? null }];
    });
  const ranked = [...rows]
    .filter((r) => r.value !== undefined)
    .sort((a, b) => (b.value as number) - (a.value as number));
  const rankOf = new Map(ranked.map((r, i) => [r.p.id, i + 1]));
  const sorted = [...rows].sort((a, b) =>
    sort.key === "place"
      ? sort.dir * a.p.name.localeCompare(b.p.name)
      : sort.dir * (((a.value ?? -Infinity) as number) - ((b.value ?? -Infinity) as number)),
  );

  const sel = state.sel ? world.byId.get(state.sel) : undefined;
  const count = matchIds.size;

  const setClause = (i: number, c: Clause) =>
    patch({ filter: state.filter.map((x, k) => (k === i ? c : x)) });

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>{t("at.title")}</h1>
        <p className={styles.meta}>
          {t("at.discovered", { n: discovered.size, total: world.places.length })}
        </p>
      </header>
      <p className={styles.note}>{t("at.intro")}</p>
      {notFound && (
        <p role="status" className={styles.note}>
          {t("at.notFound")}
        </p>
      )}

      <div className={styles.toolbar}>
        <div className={styles.search}>
          <label>
            {t("at.search")}
            <input
              ref={searchRef}
              type="search"
              value={query}
              placeholder={t("at.searchHint")}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && found[0]) {
                  open(found[0].id);
                  setQuery("");
                }
                if (e.key === "Escape") setQuery("");
              }}
            />
          </label>
          {found.length > 0 && (
            <ul className={styles.results} aria-label={t("at.search")}>
              {found.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      open(p.id);
                      setQuery("");
                    }}
                  >
                    {p.flag} {p.name}
                    {p.capital &&
                    norm(p.capital).includes(norm(query)) &&
                    !norm(p.name).includes(norm(query))
                      ? ` · ${p.capital}`
                      : ""}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <label>
          {t("at.layer")}
          <select value={state.layer} onChange={(e) => patch({ layer: e.target.value as LayerId })}>
            {LAYERS.map((l) => (
              <option key={l.id} value={l.id}>
                {t(`at.layer.${l.id}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("at.view.label")}
          <select
            value={state.view}
            onChange={(e) => patch({ view: e.target.value as AtlasState["view"] })}
          >
            <option value="map">{t("at.view.map")}</option>
            <option value="table">{t("at.view.table")}</option>
          </select>
        </label>
      </div>

      <details className={styles.card} open={filtering}>
        <summary className={styles.summary}>{t("at.filter")}</summary>
        {state.filter.map((c, i) => (
          <div key={i} className={styles.filterRow}>
            <label>
              {t("at.filter.layer")}
              <select
                value={c.layer}
                onChange={(e) => {
                  const l = e.target.value as Clause["layer"];
                  setClause(
                    i,
                    l === "landlocked"
                      ? { layer: l, op: "=", value: true }
                      : { layer: l, op: ">", value: 0 },
                  );
                }}
              >
                {[...INDICATORS, { id: "landlocked" as const }].map((l) => (
                  <option key={l.id} value={l.id}>
                    {t(`at.layer.${l.id}` as MessageKey)}
                  </option>
                ))}
              </select>
            </label>
            {typeof c.value === "boolean" ? (
              <label>
                {t("at.filter.value")}
                <select
                  value={String(c.value)}
                  onChange={(e) => setClause(i, { ...c, value: e.target.value === "true" })}
                >
                  <option value="true">{t("at.filter.yes")}</option>
                  <option value="false">{t("at.filter.no")}</option>
                </select>
              </label>
            ) : (
              <>
                <label>
                  {t("at.filter.op")}
                  <select
                    value={c.op}
                    onChange={(e) => setClause(i, { ...c, op: e.target.value as Op })}
                  >
                    {OPS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("at.filter.value")}
                  <input
                    type="number"
                    value={c.value}
                    onChange={(e) => setClause(i, { ...c, value: Number(e.target.value) })}
                  />
                </label>
              </>
            )}
            <button
              type="button"
              className={styles.link}
              onClick={() => patch({ filter: state.filter.filter((_, k) => k !== i) })}
            >
              {t("at.filter.remove", {
                clause: `${t(`at.layer.${c.layer}` as MessageKey)} ${c.op} ${String(c.value)}`,
              })}
            </button>
          </div>
        ))}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.link}
            disabled={state.filter.length >= MAX_CLAUSES}
            onClick={() =>
              patch({
                filter: [
                  ...state.filter,
                  {
                    layer:
                      state.layer === "political" || state.layer === "landlocked"
                        ? "population"
                        : (state.layer as Clause["layer"]),
                    op: ">",
                    value: 0,
                  },
                ],
              })
            }
          >
            {t("at.filter.add")}
          </button>
          {filtering && (
            <button type="button" className={styles.link} onClick={() => patch({ filter: [] })}>
              {t("at.filter.reset")}
            </button>
          )}
          {state.filter.length >= MAX_CLAUSES && (
            <span className={styles.note}>{t("at.filter.max")}</span>
          )}
        </div>
        {filtering && (
          <p role="status" className={styles.note}>
            {count === 0
              ? t("at.filter.empty")
              : count === 1
                ? t("at.filter.count1")
                : t("at.filter.count", { n: count })}
          </p>
        )}
      </details>

      <div className={styles.layout}>
        <div>
          {state.view === "map" ? (
            <>
              <div className={styles.mapBox}>
                <GameMap
                  lods={lods}
                  entities={world.places.map((p: Place) => ({
                    id: p.id,
                    name: p.name,
                    labelPoint: p.labelPoint,
                  }))}
                  states={mapStates}
                  classes={view.classes}
                  {...(dimmed ? { dimmed } : {})}
                  mode="select"
                  onSelect={open}
                  onHover={setHover}
                  labels={LABELS}
                  aria-label={t("at.mapAria")}
                />
              </div>
              <p className={styles.hover} role="status" aria-live="polite">
                {hover ? describe(hover) : t("at.hover.none")}
              </p>
              <ul className={styles.legend} aria-label={t("at.legend")}>
                {view.legend.map((l) => (
                  <li key={l.cls}>
                    <span className={styles.swatch} data-cls={l.cls} aria-hidden="true" />
                    {l.label}
                  </li>
                ))}
                {view.noData.size > 0 && layer.kind === "indicator" && (
                  <li>
                    <span className={styles.swatch} data-cls="nodata" aria-hidden="true" />
                    {t("at.noData")}
                  </li>
                )}
                {view.keyItems.map((k) => (
                  <li key={k.label}>
                    <span aria-hidden="true">{k.mark}</span> {k.label}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <caption className={styles.srOnly}>
                  {t("at.table.caption", { layer: layerLabel, n: sorted.length })}
                </caption>
                <thead>
                  <tr>
                    <th
                      scope="col"
                      aria-sort={
                        sort.key === "place"
                          ? sort.dir === 1
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <button
                        type="button"
                        className={styles.sortButton}
                        aria-label={t("at.table.sort", { column: t("at.table.place") })}
                        onClick={() =>
                          setSort({
                            key: "place",
                            dir: sort.key === "place" ? (-sort.dir as 1 | -1) : 1,
                          })
                        }
                      >
                        {t("at.table.place")}
                      </button>
                    </th>
                    <th
                      scope="col"
                      aria-sort={
                        sort.key === "value"
                          ? sort.dir === 1
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <button
                        type="button"
                        className={styles.sortButton}
                        aria-label={t("at.table.sort", { column: t("at.table.value") })}
                        onClick={() =>
                          setSort({
                            key: "value",
                            dir: sort.key === "value" ? (-sort.dir as 1 | -1) : -1,
                          })
                        }
                      >
                        {layer.kind === "indicator" ? layerLabel : t("at.table.value")}
                      </button>
                    </th>
                    <th scope="col">{t("at.table.rank")}</th>
                    <th scope="col">{t("at.table.year")}</th>
                    <th scope="col">{t("at.table.source")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(({ p, value, year }) => (
                    <tr key={p.id} data-id={p.id}>
                      <th scope="row">
                        <button
                          type="button"
                          className={styles.link}
                          aria-label={t("at.table.open", { name: p.name })}
                          onClick={() => open(p.id)}
                        >
                          {p.flag} {p.name}
                        </button>
                      </th>
                      <td>
                        {layer.kind === "indicator" && stat
                          ? value === undefined
                            ? t("at.noData")
                            : formatValue(stat, value)
                          : state.layer === "landlocked"
                            ? p.landlocked
                              ? t("at.card.landlocked")
                              : t("at.card.coastal")
                            : t(`sil.continent.${p.continent}` as MessageKey)}
                      </td>
                      <td>{rankOf.get(p.id) ?? ""}</td>
                      <td>{year ?? ""}</td>
                      <td>{stat ? sourceName(stat.source_id) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <section aria-labelledby="at-compare" className={styles.tray}>
            <h2 id="at-compare">{t("at.compare.title")}</h2>
            {state.compare.length === 0 && (
              <span className={styles.note}>{t("at.compare.empty")}</span>
            )}
            {state.compare.map((id) => (
              <span key={id} className={styles.chip}>
                {nameOf(id)}
                <button
                  type="button"
                  aria-label={t("at.compare.remove", { name: nameOf(id) })}
                  onClick={() => patch({ compare: removeCompare(state.compare, id) })}
                >
                  <span aria-hidden="true">✕</span>
                </button>
              </span>
            ))}
            {state.compare.length >= 2 && (
              <button
                type="button"
                className={styles.link}
                onClick={() => setShowCompare((v) => !v)}
              >
                {showCompare ? t("at.compare.hide") : t("at.compare.open")}
              </button>
            )}
          </section>
          {toast && (
            <p role="status" className={styles.note}>
              {toast}
            </p>
          )}
          {showCompare && state.compare.length >= 2 && (
            <table className={styles.compareTable}>
              <thead>
                <tr>
                  <th scope="col">{t("at.compare.title")}</th>
                  {state.compare.map((id) => (
                    <th key={id} scope="col">
                      {nameOf(id)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {INDICATORS.map((l) => {
                  const s = world.stats.get(l.id);
                  return (
                    <tr key={l.id}>
                      <th scope="row">{t(`at.layer.${l.id}` as MessageKey)}</th>
                      {state.compare.map((id) => {
                        const v = world.value(l.id, id);
                        return (
                          <td key={id}>
                            {v && s
                              ? `${formatValue(s, v[0])}${v[1] ? ` (${v[1]})` : ""}`
                              : t("at.noData")}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <aside aria-label={t("at.card")} className={styles.card}>
          {!sel ? (
            <p className={styles.note}>{t("at.card.none")}</p>
          ) : (
            <PlaceCard
              place={sel}
              world={world}
              inCompare={state.compare.includes(sel.id)}
              onCompare={() => compare(sel.id)}
              onOpen={open}
              onClose={() => patch({ sel: null })}
            />
          )}
          <QuizMe layer={state.layer} count={count} filtering={filtering} />
        </aside>
      </div>
    </div>
  );
}

function PlaceCard({
  place,
  world,
  inCompare,
  onCompare,
  onOpen,
  onClose,
}: {
  place: Place;
  world: AtlasWorld;
  inCompare: boolean;
  onCompare: () => void;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const nb = world.neighbors.get(place.id) ?? [];
  const facts = world.facts.get(place.id) ?? [];
  return (
    <>
      <h2>
        <span aria-hidden="true">{place.flag}</span> {place.name}
      </h2>
      <dl>
        <div>
          <dt>{t("at.card.capital")}</dt>
          <dd>{place.capital ?? "—"}</dd>
        </div>
        <div>
          <dt>{t("at.card.continent")}</dt>
          <dd>{t(`sil.continent.${place.continent}` as MessageKey)}</dd>
        </div>
        <div>
          <dt>{t("at.card.coast")}</dt>
          <dd>{place.landlocked ? t("at.card.landlocked") : t("at.card.coastal")}</dd>
        </div>
        {INDICATORS.map((l) => {
          const s = world.stats.get(l.id);
          const v = world.value(l.id, place.id);
          return (
            <div key={l.id}>
              <dt>{t(`at.layer.${l.id}` as MessageKey)}</dt>
              <dd>
                {v && s
                  ? `${formatValue(s, v[0])}${s.id === "capital-latitude" ? "" : ` ${s.unit}`} (${sourceName(s.source_id)}${v[1] ? `, ${v[1]}` : ""})`
                  : t("at.noData")}
              </dd>
            </div>
          );
        })}
      </dl>
      <div>
        <h3>
          {nb.length > 0 ? t("at.card.neighbors", { n: nb.length }) : t("at.card.noNeighbors")}
        </h3>
        {nb.length > 0 && (
          <ul>
            {nb.map((id) => (
              <li key={id}>
                <button type="button" className={styles.link} onClick={() => onOpen(id)}>
                  {world.byId.get(id)?.name ?? id}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {facts.length > 0 && (
        <div>
          <h3>{t("at.card.facts", { n: facts.length })}</h3>
          <ul>
            {facts.map((f) => (
              <li key={f.id}>{f.text}</li>
            ))}
          </ul>
          <p className={styles.note}>{t("at.card.factsNote")}</p>
        </div>
      )}
      <div className={styles.actions}>
        <button type="button" className={styles.link} disabled={inCompare} onClick={onCompare}>
          {inCompare ? t("at.card.inCompare") : t("at.card.compare")}
        </button>
        <button type="button" className={styles.link} onClick={onClose}>
          {t("at.card.close")}
        </button>
      </div>
    </>
  );
}

/** "Quiz me on this" (atlas-explorer §8): a game set up for the current layer. Needs at least 4 matching places. */
function QuizMe({
  layer,
  count,
  filtering,
}: {
  layer: LayerId;
  count: number;
  filtering: boolean;
}) {
  const tooFew = filtering && count < 4;
  const target =
    layer === "landlocked"
      ? { href: "/play/quiz/landlocked-countries", label: t("at.quiz.tiles") }
      : layer === "political"
        ? { href: "/play/silhouette", label: t("at.quiz.silhouette") }
        : {
            href: `/play/rank-it?stat=${layer}&origin=atlas`,
            label: t("at.quiz.rank", { layer: t(`at.layer.${layer}` as MessageKey).toLowerCase() }),
          };
  return (
    <section aria-labelledby="at-quiz">
      <h3 id="at-quiz">{t("at.quiz")}</h3>
      {tooFew ? (
        <>
          <span className={`${styles.link} ${styles.disabled}`} aria-disabled="true" role="link">
            {target.label}
          </span>
          <p className={styles.note}>{t("at.quiz.disabled", { n: count })}</p>
        </>
      ) : (
        <a className={styles.link} href={target.href}>
          {target.label}
        </a>
      )}
    </section>
  );
}
