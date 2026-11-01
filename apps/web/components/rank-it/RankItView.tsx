"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { Button, Card } from "@meridian/ui";
import {
  announceMove,
  correctPairs,
  useLogScale,
  valueOf,
  yearRange,
  type Difficulty,
  type Format,
  type HigherLowerRun,
  type OrderRound,
  type RankWorld,
  type StatDef,
  type TopPicksRound,
} from "@meridian/rank-it";
import { t, type MessageKey } from "../../lib/i18n";
import {
  canPlay,
  choose,
  hint,
  move,
  next,
  points,
  submit,
  toggle,
  type Config,
  type Session,
} from "../../lib/rank-it/controller";
import { ReportButton } from "../report/ReportButton";
import styles from "./rank-it.module.css";
import "../../lib/messages/br";
import "../../lib/messages/rk";
import "../../lib/messages/sil";

const CONTINENTS = ["AF", "AS", "EU", "NA", "OC", "SA"];
const FORMATS: Format[] = ["order", "higher-lower", "top-picks"];
const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard"];

const statName = (id: string): string => t(`rk.stat.${id}` as MessageKey);

/** A value as text, with its unit (latitude gets N or S). */
export function formatValue(def: StatDef, v: number): string {
  if (def.id === "capital-latitude")
    return `${Math.abs(v).toFixed(def.decimals)}° ${v >= 0 ? "N" : "S"}`;
  return v.toLocaleString("en", {
    minimumFractionDigits: def.decimals,
    maximumFractionDigits: def.decimals,
  });
}
const withUnit = (def: StatDef, v: number): string =>
  def.id === "capital-latitude" ? formatValue(def, v) : `${formatValue(def, v)} ${def.unit}`;

/** Bar length 0..1: linear, log for wide ranges, shifted when values go negative. */
function barFraction(v: number, all: readonly number[], log: boolean): number {
  const min = Math.min(...all);
  const max = Math.max(...all);
  if (max === min) return 1;
  if (log) return 0.1 + (0.9 * (Math.log(v) - Math.log(min))) / (Math.log(max) - Math.log(min));
  if (min >= 0) return Math.max(0.04, v / max);
  return 0.1 + (0.9 * (v - min)) / (max - min);
}

export type RankItViewProps = {
  session: Session;
  world: RankWorld;
  onChange: (s: Session) => void;
  onConfig: (c: Config) => void;
  best?: number | null;
  newBest?: boolean;
  contentVersion?: string;
};

export function RankItView({
  session: s,
  world,
  onChange,
  onConfig,
  best,
  newBest,
  contentVersion,
}: RankItViewProps) {
  const [noRound, setNoRound] = useState(false);
  const name = (id: string): string => world.byId.get(id)?.name ?? id;
  const set = (patch: Partial<Config>) => {
    const config = { ...s.config, ...patch };
    const ok = canPlay(world, config);
    setNoRound(!ok);
    if (ok) onConfig(config);
  };
  const r = s.round;
  const def = world.statById.get(r.stat) as StatDef;

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>{t("rk.title")}</h1>
        <p className={styles.meta}>
          {t("rk.round", { n: s.roundNo })} ·{" "}
          {t("rk.points", { n: s.total + (r.kind === "higher-lower" ? 0 : points(s)) })}
        </p>
      </header>

      <fieldset className={styles.options}>
        <legend className={styles.srOnly}>{t("rk.options")}</legend>
        <label>
          {t("rk.opt.format")}
          <select
            value={s.config.format}
            onChange={(e) => set({ format: e.target.value as Format })}
          >
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {t(`rk.opt.format.${f}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("rk.opt.stat")}
          <select value={s.config.stat} onChange={(e) => set({ stat: e.target.value })}>
            <option value="random">{t("rk.opt.stat.random")}</option>
            {world.stats.map((x) => (
              <option key={x.id} value={x.id}>
                {statName(x.id)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("rk.opt.scope")}
          <select value={s.config.scope} onChange={(e) => set({ scope: e.target.value })}>
            <option value="world">{t("br.opt.region.world")}</option>
            {CONTINENTS.map((c) => (
              <option key={c} value={c}>
                {t(`sil.continent.${c}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("rk.opt.difficulty")}
          <select
            value={s.config.difficulty}
            onChange={(e) => set({ difficulty: e.target.value as Difficulty })}
          >
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {t(`rk.opt.difficulty.${d}` as MessageKey)}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
      {noRound && (
        <p role="alert" className={styles.note}>
          {t("rk.opt.noRound")}
        </p>
      )}

      {r.kind === "order" && (
        <OrderPlay
          round={r}
          def={def}
          world={world}
          revealed={s.phase === "revealed"}
          onMove={(from, to) => onChange(move(s, from, to))}
          onHint={() => onChange(hint(s))}
          onSubmit={() => onChange(submit(s, Date.now()))}
        />
      )}
      {r.kind === "top-picks" && (
        <TopPlay
          round={r}
          def={def}
          world={world}
          revealed={s.phase === "revealed"}
          onToggle={(id) => onChange(toggle(s, id))}
          onReveal={() => onChange(submit(s, Date.now()))}
        />
      )}
      {r.kind === "higher-lower" && (
        <HigherLowerPlay
          run={r}
          def={def}
          world={world}
          best={best ?? null}
          newBest={newBest ?? false}
          onChoose={(c) => onChange(choose(world, s, c, Date.now()))}
        />
      )}

      {s.phase === "revealed" && (
        <Card className={styles.result}>
          <ReportButton
            targetRef={
              r.kind === "higher-lower"
                ? r.current
                : ((r.kind === "order" ? r.truth[0] : r.truth[0]) ?? r.stat)
            }
            context={{
              game_id: "rank-it",
              seed: s.seed,
              round: s.roundNo,
              content_version: contentVersion ?? "unknown",
              stat: r.stat,
              names: (r.kind === "higher-lower" ? r.used : r.truth).map(name),
            }}
          />
          <Button variant="primary" onPress={() => onChange(next(world, s, Date.now()))}>
            {r.kind === "higher-lower" ? t("rk.hl.again") : t("rk.next")}
          </Button>
        </Card>
      )}
    </div>
  );
}

function Footer({ def, world, ids }: { def: StatDef; world: RankWorld; ids: readonly string[] }) {
  const years = yearRange(world, def.id, ids);
  return (
    <p className={styles.note}>
      {years
        ? t("rk.reveal.footer", { source: def.source_note, years })
        : t("rk.reveal.footerNoYear", { source: def.source_note })}
    </p>
  );
}

function OrderPlay({
  round,
  def,
  world,
  revealed,
  onMove,
  onHint,
  onSubmit,
}: {
  round: OrderRound;
  def: StatDef;
  world: RankWorld;
  revealed: boolean;
  onMove: (from: number, to: number) => void;
  onHint: () => void;
  onSubmit: () => void;
}) {
  const [grabbed, setGrabbed] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const [dragging, setDragging] = useState<number | null>(null);
  const name = (id: string): string => world.byId.get(id)?.name ?? id;
  const n = round.arrangement.length;
  useEffect(() => setGrabbed(null), [round.truth.join()]);

  const values = round.truth.map((id) => valueOf(world, def.id, id) as number);
  const log = useLogScale(values);

  const onKey = (e: KeyboardEvent, id: string, index: number) => {
    if (revealed) return;
    if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      if (grabbed === id) {
        setGrabbed(null);
        setSaid(t("rk.order.dropped", { name: name(id), n: index + 1, total: n }));
      } else {
        setGrabbed(id);
        setSaid(t("rk.order.grabbed", { name: name(id) }));
      }
    } else if (grabbed === id && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      const to = index + (e.key === "ArrowUp" ? -1 : 1);
      if (to < 0 || to >= n) return;
      onMove(index, to);
      setSaid(announceMove(name(id), to, n));
    } else if (e.key === "Escape") setGrabbed(null);
  };

  return (
    <section>
      <p className={styles.prompt}>
        {t("rk.order.prompt", { stat: t(`rk.stat.${def.id}` as MessageKey).toLowerCase() })}
      </p>
      <ol className={styles.list} aria-label={t("rk.order.list")}>
        {round.arrangement.map((id, i) => {
          const truthIndex = round.truth.indexOf(id);
          const ok = revealed ? truthIndex === i : undefined;
          const v = valueOf(world, def.id, id) as number;
          return (
            <li
              key={id}
              className={styles.row}
              data-grabbed={grabbed === id}
              {...(ok === undefined ? {} : { "data-ok": ok })}
              draggable={!revealed}
              onDragStart={() => setDragging(i)}
              onDragOver={(e) => dragging !== null && e.preventDefault()}
              onDrop={() => {
                if (dragging !== null) onMove(dragging, i);
                setDragging(null);
              }}
            >
              <button
                type="button"
                className={styles.handle}
                aria-label={t("rk.order.handle", { name: name(id), n: i + 1, total: n })}
                aria-pressed={grabbed === id}
                disabled={revealed}
                onKeyDown={(e) => onKey(e, id, i)}
                onBlur={() => setGrabbed((g) => (g === id ? null : g))}
              >
                <span aria-hidden="true">≡</span>
              </button>
              <span className={styles.name}>
                {i + 1}. {name(id)}
              </span>
              {!revealed && (
                <span className={styles.moves}>
                  <button
                    type="button"
                    className={styles.move}
                    aria-label={t("rk.order.up", { name: name(id) })}
                    disabled={i === 0}
                    onClick={() => onMove(i, i - 1)}
                  >
                    <span aria-hidden="true">↑</span>
                  </button>
                  <button
                    type="button"
                    className={styles.move}
                    aria-label={t("rk.order.down", { name: name(id) })}
                    disabled={i === n - 1}
                    onClick={() => onMove(i, i + 1)}
                  >
                    <span aria-hidden="true">↓</span>
                  </button>
                </span>
              )}
              {revealed && <span aria-hidden="true">{ok ? "✓" : "✕"}</span>}
              {revealed && (
                <span className={styles.detail}>
                  <span>
                    {withUnit(def, v)} ·{" "}
                    {ok ? t("rk.reveal.right") : t("rk.reveal.wrong", { n: truthIndex + 1 })}
                  </span>
                  <span
                    className={styles.bar}
                    role="presentation"
                    style={{ width: `${Math.round(barFraction(v, values, log) * 100)}%` }}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className={styles.srOnly} role="status" aria-live="polite">
        {said}
      </p>
      {round.hint && !revealed && (
        <p className={styles.note}>
          {t("rk.hint.shown", { name: name(round.hint.id), n: round.hint.position + 1 })}
        </p>
      )}
      {!revealed && (
        <div className={styles.actions}>
          <Button variant="primary" onPress={onSubmit}>
            {t("rk.submit")}
          </Button>
          <Button isDisabled={round.hint !== null} onPress={onHint}>
            {t("rk.hint")}
          </Button>
        </div>
      )}
      {revealed && (
        <div aria-live="polite">
          <h2>
            {t("rk.reveal.title", {
              n: Math.max(
                0,
                correctPairs(round.arrangement, round.truth) * 10 - (round.hint ? 20 : 0),
              ),
            })}
          </h2>
          <p className={styles.note}>
            {t("rk.reveal.pairs", { n: correctPairs(round.arrangement, round.truth) })}
          </p>
          {log && <p className={styles.note}>{t("rk.reveal.scale")}</p>}
          <Footer def={def} world={world} ids={round.truth} />
        </div>
      )}
    </section>
  );
}

function TopPlay({
  round,
  def,
  world,
  revealed,
  onToggle,
  onReveal,
}: {
  round: TopPicksRound;
  def: StatDef;
  world: RankWorld;
  revealed: boolean;
  onToggle: (id: string) => void;
  onReveal: () => void;
}) {
  const name = (id: string): string => world.byId.get(id)?.name ?? id;
  const score = useMemo(
    () =>
      round.picks.reduce(
        (sum, id) => sum + (round.truth.includes(id) ? 5 - round.truth.indexOf(id) : 0),
        0,
      ),
    [round],
  );
  return (
    <section>
      <p className={styles.prompt}>
        {t("rk.top.prompt", {
          stat: t(`rk.stat.${def.id}` as MessageKey).toLowerCase(),
          n: round.picks.length,
        })}
      </p>
      <ul className={styles.grid} aria-label={t("rk.top.grid")}>
        {round.grid.map((id) => {
          const picked = round.picks.includes(id);
          const rank = round.truth.indexOf(id);
          return (
            <li key={id}>
              <button
                type="button"
                className={styles.cell}
                aria-pressed={picked}
                disabled={revealed}
                data-truth={revealed ? rank !== -1 : undefined}
                onClick={() => onToggle(id)}
              >
                {picked && <span aria-hidden="true">● </span>}
                {name(id)}
                {revealed && (
                  <small>
                    {" "}
                    {withUnit(def, valueOf(world, def.id, id) as number)}
                    {rank !== -1 ? ` · #${rank + 1}` : ""}
                  </small>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {!revealed && (
        <div className={styles.actions}>
          <Button variant="primary" isDisabled={round.picks.length === 0} onPress={onReveal}>
            {t("rk.top.reveal")}
          </Button>
        </div>
      )}
      {revealed && (
        <div aria-live="polite">
          <h2>{t("rk.top.title", { n: score })}</h2>
          <p>{t("rk.top.truth")}</p>
          <ol>
            {round.truth.map((id) => (
              <li key={id}>
                {name(id)} · {withUnit(def, valueOf(world, def.id, id) as number)}
                {round.picks.includes(id) ? ` · ${t("rk.top.picked")}` : ""}
              </li>
            ))}
          </ol>
          <Footer def={def} world={world} ids={round.grid} />
        </div>
      )}
    </section>
  );
}

function HigherLowerPlay({
  run,
  def,
  world,
  best,
  newBest,
  onChoose,
}: {
  run: HigherLowerRun;
  def: StatDef;
  world: RankWorld;
  best: number | null;
  newBest: boolean;
  onChoose: (c: "higher" | "lower") => void;
}) {
  const name = (id: string): string => world.byId.get(id)?.name ?? id;
  const over = run.status === "over";
  const cur = valueOf(world, def.id, run.current) as number;
  const nxt = valueOf(world, def.id, run.next) as number;
  return (
    <section>
      <p className={styles.note}>{t("rk.hl.stat", { stat: statName(def.id) })}</p>
      <p className={styles.prompt}>
        {t("rk.hl.prompt", {
          name: name(run.current),
          value: formatValue(def, cur),
          unit: def.id === "capital-latitude" ? "" : def.unit,
          other: name(run.next),
        }).replace("  ", " ")}
      </p>
      <p className={styles.meta} aria-live="polite">
        {t("rk.hl.streak", { n: run.streak })}
        {best !== null ? ` · ${t("rk.hl.best", { n: Math.max(best, run.streak) })}` : ""}
      </p>
      {!over && (
        <div className={styles.actions}>
          <Button variant="primary" onPress={() => onChoose("higher")}>
            {t("rk.hl.higher")}
          </Button>
          <Button variant="primary" onPress={() => onChoose("lower")}>
            {t("rk.hl.lower")}
          </Button>
        </div>
      )}
      {over && (
        <div aria-live="polite">
          <h2>{t("rk.hl.over", { n: run.streak })}</h2>
          {newBest && <p>{t("rk.hl.newBest")}</p>}
          <p>
            {t("rk.hl.was", {
              name: name(run.current),
              value: formatValue(def, cur),
              unit: def.id === "capital-latitude" ? "" : def.unit,
            })}
          </p>
          <p>
            {t("rk.hl.was", {
              name: name(run.next),
              value: formatValue(def, nxt),
              unit: def.id === "capital-latitude" ? "" : def.unit,
            })}
          </p>
          <Footer def={def} world={world} ids={[run.current, run.next]} />
        </div>
      )}
    </section>
  );
}
