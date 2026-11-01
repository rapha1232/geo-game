"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnswerInput, Button, Card, GameMap, type Lod, type MapFeatureState } from "@meridian/ui";
import type { Topology } from "topojson-specification";
import {
  M_RANGE,
  budget,
  groups,
  guessesLeft,
  hintAvailable,
  initials,
  roundPoints,
  shortestPaths,
  type Classification,
  type HintKind,
  type RouteLength,
} from "@meridian/border-run";
import { suggest } from "@meridian/silhouette";
import { t, type MessageKey } from "../../lib/i18n";
import { useServices } from "../shell/StorageProvider";
import { ReportButton } from "../report/ReportButton";
import type { LoadedBorderRun } from "../../lib/border-run/data";
import {
  guess,
  hasRoutes,
  hint,
  next,
  pick,
  points,
  surrender,
  type Config,
  type Session,
} from "../../lib/border-run/controller";
import styles from "./border-run.module.css";

const LABELS = {
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  zoomReset: "Reset zoom",
  focused: (name: string) => name,
  loupeHint: "Tap again inside the circle",
  pinAt: (lat: number, lon: number) => `Pin at ${lat}, ${lon}`,
};
const REGIONS = ["world", "AF", "AS", "EU", "NA", "OC", "SA"] as const;
const ICON: Record<Classification, string> = { "on-route": "✓", near: "◐", "off-route": "✕" };
const STATE: Record<Classification, MapFeatureState> = {
  "on-route": "correct",
  near: "near",
  "off-route": "wrong",
};

export type BorderRunViewProps = {
  session: Session;
  data: LoadedBorderRun;
  onChange: (s: Session) => void;
  onConfig: (c: Config) => void;
  contentVersion?: string;
};

/** The whole play screen. A pure view over a Session: every action is a controller call that returns the next one. */
export function BorderRunView({
  session: s,
  data,
  onChange,
  onConfig,
  contentVersion,
}: BorderRunViewProps) {
  const services = useServices();
  const [text, setText] = useState("");
  const [lods, setLods] = useState<Partial<Record<Lod, Topology>>>({ "110m": data.topology });
  const onNeedLod = useCallback(
    (lod: Lod) => {
      void services?.loader
        .pack<Topology>(`geo.world.${lod}`)
        .then((p) => setLods((cur) => (cur[lod] ? cur : { ...cur, [lod]: p })))
        .catch(() => undefined);
    },
    [services],
  );
  useEffect(() => setText(""), [s.roundNo]);

  const bw = data.bw(s.config.crossings);
  const r = s.round;
  const over = s.phase !== "routing";
  const name = (id: string): string => data.world.byId.get(id)?.name ?? id;
  const max = budget(r);
  const left = guessesLeft(r);
  const suggestions = !over && text.trim() !== "" ? suggest(data.world, text) : [];
  const connected = groups(bw, r);

  const states = useMemo(() => {
    const out: Record<string, MapFeatureState> = {};
    for (const g of r.guesses) out[g.entityId] = STATE[g.cls];
    const outline = [...r.hints].reverse().find((h) => h.kind === "outline")?.entityId;
    if (outline && !out[outline]) out[outline] = "highlight";
    if (over)
      for (const id of shortestPaths(bw.graph, r.a, r.b, 1)[0] ?? []) out[id] ??= "highlight";
    out[r.a] = "highlight";
    out[r.b] = "highlight";
    return out;
  }, [r, bw, over]);

  const pathNote = (): string => {
    const first = connected.find((g) => g.includes(r.a)) ?? [];
    return first.map(name).join(", ") || t("br.announce.none");
  };
  const last = r.guesses[r.guesses.length - 1];
  const announcement = last
    ? t("br.announce", {
        name: name(last.entityId),
        cls: t(`br.cls.${last.cls}` as MessageKey).toLowerCase(),
        path: pathNote(),
      })
    : "";
  const eventMessage = (() => {
    switch (s.lastEvent?.kind) {
      case "not-recognized":
        return { tone: "error" as const, text: t("br.notRecognized") };
      case "already-guessed":
        return { tone: "error" as const, text: t("br.alreadyGuessed") };
      case "on-map":
        return { tone: "hint" as const, text: t("br.onMap", { name: name(s.lastEvent.entityId) }) };
      case "try-english":
        return { tone: "hint" as const, text: t("br.tryEnglish") };
      case "ambiguous":
        return { tone: "hint" as const, text: s.lastEvent.message };
      default:
        return null;
    }
  })();

  const total = s.done.reduce((sum, d) => sum + roundPoints(d), 0);
  const letters = initials(bw, r).join(" · ");
  const crossingUsed = shortestPaths(bw.graph, r.a, r.b, 5).flatMap((p) =>
    p.slice(1).flatMap((id, i) => {
      const prev = p[i] as string;
      return data.crossings.filter(
        (c) => (c.a === prev && c.b === id) || (c.a === id && c.b === prev),
      );
    }),
  );

  const [noRoutes, setNoRoutes] = useState(false);
  const set = (patch: Partial<Config>) => {
    const config = { ...s.config, ...patch };
    const ok = hasRoutes(data, config);
    setNoRoutes(!ok);
    if (ok) onConfig(config);
  };

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>{t("br.title")}</h1>
        <p className={styles.meta}>
          {t("br.round", { n: s.roundNo })} · {t("br.points", { n: total })}
        </p>
      </header>

      <fieldset className={styles.options}>
        <legend className={styles.srOnly}>{t("br.options")}</legend>
        <label>
          {t("br.opt.route")}
          <select
            value={s.config.route}
            onChange={(e) => set({ route: e.target.value as RouteLength })}
          >
            {(Object.keys(M_RANGE) as RouteLength[]).map((k) => (
              <option key={k} value={k}>
                {t(`br.opt.route.${k}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("br.opt.region")}
          <select value={s.config.region} onChange={(e) => set({ region: e.target.value })}>
            {REGIONS.map((k) => (
              <option key={k} value={k}>
                {k === "world" ? t("br.opt.region.world") : t(`sil.continent.${k}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={s.config.crossings}
            onChange={(e) => set({ crossings: e.target.checked })}
          />
          {t("br.opt.crossings")}
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={s.config.mode === "practice"}
            onChange={(e) => set({ mode: e.target.checked ? "practice" : "unlimited" })}
          />
          {t("br.opt.practice")}
        </label>
      </fieldset>

      {noRoutes && (
        <p role="alert" className={styles.note}>
          {t("br.opt.noRoutes")}
        </p>
      )}

      <p className={styles.route}>{t("br.route", { from: name(r.a), to: name(r.b) })}</p>
      <p className={styles.note}>{t("br.intro", { m: r.m })}</p>

      <div className={styles.layout}>
        <div className={styles.mapBox}>
          <GameMap
            lods={lods}
            entities={data.mapEntities}
            states={states}
            mode="view"
            onNeedLod={onNeedLod}
            labels={LABELS}
            aria-label={t("br.mapAria")}
          />
        </div>

        <div className={styles.side}>
          <p className={styles.counter}>
            {max === null
              ? t("br.guessCountOpen", { n: r.guesses.length + (over ? 0 : 1) })
              : t("br.guessCount", {
                  n: Math.min(max, r.guesses.length + (over ? 0 : 1)),
                  max,
                })}
            {left !== null && left <= 2 && !over ? ` · ${left}` : ""}
          </p>

          {!over && (
            <section aria-label={t("br.hints")}>
              <div className={styles.hints}>
                {(["outline", "initials", "reveal"] as HintKind[]).map((k) => (
                  <Button
                    key={k}
                    isDisabled={!hintAvailable(bw, r, k)}
                    onPress={() => onChange(hint(data, s, k, Date.now()))}
                  >
                    {t(`br.hint.${k}` as MessageKey)}
                  </Button>
                ))}
              </div>
              <p className={styles.note}>{t("br.hint.cost")}</p>
            </section>
          )}
          {r.hints.length > 0 && (
            <ul className={styles.hintNotes} aria-label={t("br.hints")}>
              {r.hints.map((h, i) => (
                <li key={i}>
                  {h.kind === "initials"
                    ? t("br.hint.initialsShown", { letters })
                    : t(h.kind === "outline" ? "br.hint.outlineShown" : "br.hint.revealShown", {
                        name: name(h.entityId ?? ""),
                      })}
                </li>
              ))}
            </ul>
          )}

          <ol className={styles.rows} aria-label={t("br.title")}>
            {r.guesses.map((g) => (
              <li key={g.entityId} className={styles.row} data-cls={g.cls}>
                <span className={styles.rowName}>
                  {name(g.entityId)}
                  {g.note === "spelling-corrected" && (
                    <small> {t("sil.acceptedAs", { name: name(g.entityId) })}</small>
                  )}
                </span>
                <span>
                  <span aria-hidden="true">{ICON[g.cls]}</span> {t(`br.cls.${g.cls}` as MessageKey)}
                </span>
              </li>
            ))}
          </ol>
          <p className={styles.srOnly} role="status" aria-live="polite">
            {announcement}
          </p>

          <section aria-label={t("br.groups")}>
            <h2 className={styles.note}>{t("br.groups")}</h2>
            <ul className={styles.groups}>
              {connected.length === 0 ? (
                <li>{t("br.groupsEmpty")}</li>
              ) : (
                connected.map((g) => <li key={g.join()}>{g.map(name).join(" → ")}</li>)
              )}
            </ul>
          </section>

          {!over && (
            <>
              <AnswerInput
                label={t("br.inputLabel")}
                value={text}
                onChange={setText}
                onSubmit={(v) => {
                  onChange(guess(data, s, v, Date.now()));
                  setText("");
                }}
                status={eventMessage}
                autoFocus
              />
              {suggestions.length > 0 && (
                <ul className={styles.suggestions} aria-label={t("br.suggestions")}>
                  {suggestions.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange(pick(data, s, e.id, Date.now()));
                          setText("");
                        }}
                      >
                        {e.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Button variant="ghost" onPress={() => onChange(surrender(s, Date.now()))}>
                {t("br.giveUp")}
              </Button>
            </>
          )}
        </div>
      </div>

      {over && (
        <Card className={styles.result}>
          <div aria-live="polite">
            <h2>
              {r.status === "won"
                ? t("br.won", { n: r.guesses.length })
                : r.gaveUp
                  ? t("br.gaveUp")
                  : t("br.lost")}
            </h2>
            <p className={styles.meta}>{t("br.points", { n: points(s) })}</p>
          </div>
          <h3>{t("br.routes")}</h3>
          <ul className={styles.paths}>
            {shortestPaths(bw.graph, r.a, r.b, 5).map((p) => (
              <li key={p.join()}>{p.map(name).join(" → ")}</li>
            ))}
          </ul>
          {[...new Set(crossingUsed)].map((c) => (
            <p key={c.name} className={styles.note}>
              {t("br.crossingNote", { a: name(c.a), b: name(c.b), name: c.name })}
            </p>
          ))}
          <ReportButton
            targetRef={r.a}
            context={{
              game_id: "border-run",
              seed: s.seed,
              round: s.roundNo,
              content_version: contentVersion ?? "unknown",
              from: r.a,
              to: r.b,
            }}
          />
          <Button variant="primary" onPress={() => onChange(next(data, s, Date.now()))}>
            {t("br.next")}
          </Button>
        </Card>
      )}
    </div>
  );
}
