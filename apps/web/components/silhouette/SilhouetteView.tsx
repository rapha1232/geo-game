"use client";

import { useMemo, useState } from "react";
import { AnswerInput, Button, Card, ChoiceGrid } from "@meridian/ui";
import {
  HINT_COUNT,
  roundPoints,
  announceGuess,
  formatDistance,
  hintContent,
  isOpen,
  maxGuesses,
  proximityBar,
  suggest,
  type GuessRow,
  type HintContent,
  type World,
} from "@meridian/silhouette";
import {
  answer,
  followUpsCorrect,
  guess,
  hint,
  next,
  pick,
  points,
  surrender,
  type Session,
} from "../../lib/silhouette/controller";
import { silhouettePath, VIEW } from "../../lib/silhouette/draw";
import type { Shape } from "../../lib/silhouette/data";
import { t, type MessageKey } from "../../lib/i18n";
import styles from "./silhouette.module.css";

const ARROW: Record<string, string> = {
  N: "↑",
  NE: "↗",
  E: "→",
  SE: "↘",
  S: "↓",
  SW: "↙",
  W: "←",
  NW: "↖",
};
const fmt = (n: number): string => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

function hintText(c: HintContent): string {
  switch (c.hint) {
    case 1:
      return t("sil.hint.area", { area: fmt(c.areaKm2), pct: c.largerThanPercent });
    case 2:
      return t(`sil.continent.${c.continent}` as MessageKey);
    case 3:
      return c.kind === "remote"
        ? t("sil.hint.remote", {
            n: c.parts.length,
            list: c.parts
              .slice(0, 5)
              .map((p) => `${p.ref[0].toFixed(0)}°, ${p.ref[1].toFixed(0)}°`)
              .join("; "),
          })
        : t("sil.hint.neighbors", { n: c.count });
    case 4:
      return t("sil.hint.letter", { letter: c.letter });
  }
}

function Row({
  row,
  world,
  n,
  max,
  unit,
}: {
  row: GuessRow;
  world: World;
  n: number;
  max: number | null;
  unit: "km" | "mi";
}) {
  const name = world.byId.get(row.entityId)?.name ?? row.entityId;
  return (
    <li className={styles.row} data-correct={row.correct}>
      <span className={styles.rowName}>
        {name}
        {row.sharesBorder && (
          <span className={styles.border} title={t("sil.sharesBorder")}>
            {" "}
            <span aria-hidden="true">⇆</span> {t("sil.sharesBorder")}
          </span>
        )}
        {row.note === "spelling-corrected" && <small> {t("sil.acceptedAs", { name })}</small>}
        {row.note === "former-name" && <small> {t("sil.formerName", { name: row.input })}</small>}
      </span>
      <span className={styles.rowDist}>
        {row.correct ? "✓" : `${formatDistance(row.distanceKm, unit)} ${t(`sil.unit.${unit}`)}`}
      </span>
      <span className={styles.rowDir}>
        {row.correct
          ? "✓"
          : row.sector
            ? `${ARROW[row.sector]} ${row.sector}`
            : `• ${t("sil.samePoint")}`}
      </span>
      <span className={styles.rowProx}>
        <span aria-hidden="true">{proximityBar(row.proximity)}</span> {row.proximity}%
      </span>
      <span className={styles.srOnly}>{announceGuess(row, name, n, max, unit)}</span>
    </li>
  );
}

export type SilhouetteViewProps = {
  session: Session;
  world: World;
  shapes: ReadonlyMap<string, Shape>;
  onChange: (s: Session) => void;
};

/** The whole play screen. Pure view over a Session: every action is a controller call that returns the next Session. */
export function SilhouetteView({ session: s, world, shapes, onChange }: SilhouetteViewProps) {
  const [text, setText] = useState("");
  const target = world.byId.get(s.round.targetId);
  const shape = shapes.get(s.round.targetId);
  const d = useMemo(() => (shape ? silhouettePath(shape.main) : ""), [shape]);
  const max = maxGuesses(s.round);
  const unit = s.config.unit;
  const over = s.phase !== "guessing";
  const suggestions = !over && text.trim() !== "" ? suggest(world, text) : [];
  const eventMessage = (() => {
    switch (s.lastEvent?.kind) {
      case "not-recognized":
        return { tone: "error" as const, text: t("sil.notRecognized") };
      case "already-guessed":
        return { tone: "error" as const, text: t("sil.alreadyGuessed") };
      case "try-english":
        return { tone: "hint" as const, text: t("sil.tryEnglish") };
      case "ambiguous":
        return { tone: "hint" as const, text: s.lastEvent.message };
      default:
        return null;
    }
  })();

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>{t("sil.title")}</h1>
        <p className={styles.meta}>
          {t("sil.round", { n: s.roundNo })} · {t("sil.points", { n: sessionPoints(s) })}
        </p>
      </header>

      <div className={styles.layout}>
        <Card className={styles.shapeCard}>
          <svg
            viewBox={`0 0 ${VIEW} ${VIEW}`}
            role="img"
            aria-label={t("sil.shapeLabel")}
            className={styles.shape}
            style={{ transform: `rotate(${s.round.rotation}deg)` }}
          >
            <path d={d} className={styles.land} />
          </svg>
        </Card>

        <div className={styles.side}>
          <section aria-label={t("sil.hints")} className={styles.hints}>
            {Array.from({ length: HINT_COUNT }, (_, i) => i + 1).map((n) => {
              const open = isOpen(s.round, n);
              const label =
                n === 3 && (target?.remote.length ?? 0) === 0
                  ? "sil.hint.3n"
                  : (`sil.hint.${n}` as MessageKey);
              return (
                <div key={n} className={styles.hint}>
                  {open ? (
                    <p>
                      <strong>{t(label)}: </strong>
                      {hintText(hintContent(world, s.round.targetId, n))}
                    </p>
                  ) : (
                    <Button isDisabled={over} onPress={() => onChange(hint(s, n))}>
                      {t(label)}
                    </Button>
                  )}
                </div>
              );
            })}
          </section>

          <p className={styles.counter}>
            {max === null
              ? t("sil.guessCountOpen", { n: s.round.guesses.length + (over ? 0 : 1) })
              : t("sil.guessCount", {
                  n: Math.min(max, s.round.guesses.length + (over ? 0 : 1)),
                  max,
                })}
          </p>

          <ol className={styles.rows} aria-label={t("sil.title")}>
            {s.round.guesses.map((row, i) => (
              <Row key={row.entityId} row={row} world={world} n={i + 1} max={max} unit={unit} />
            ))}
          </ol>

          {!over && (
            <>
              <AnswerInput
                label={t("sil.inputLabel")}
                value={text}
                onChange={setText}
                onSubmit={(v) => {
                  onChange(guess(world, s, v, Date.now()));
                  setText("");
                }}
                status={eventMessage}
                autoFocus
              />
              {suggestions.length > 0 && (
                <ul className={styles.suggestions} aria-label={t("sil.suggestions")}>
                  {suggestions.map((e) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange(pick(world, s, e.id, Date.now()));
                          setText("");
                        }}
                      >
                        {e.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Button variant="ghost" onPress={() => onChange(surrender(world, s, Date.now()))}>
                {t("sil.giveUp")}
              </Button>
            </>
          )}
        </div>
      </div>

      {over && target && (
        <section className={styles.result} aria-live="polite">
          <h2>
            {s.round.status === "solved"
              ? t("sil.solved", { n: s.round.guesses.length, name: target.name })
              : t("sil.failed", { name: target.name })}
          </h2>

          {s.followUps.map((f, i) => {
            const answered = f.choice !== null;
            const correctLabel = f.prompt.options[f.prompt.correctIndex] as string;
            const label = (opt: string) =>
              f.prompt.kind === "flag" ? (world.byId.get(opt)?.name ?? opt) : opt;
            return (
              <div key={f.prompt.kind} className={styles.followUp}>
                <h3>
                  {t(f.prompt.kind === "capital" ? "sil.followUpCapital" : "sil.followUpFlag", {
                    name: target.name,
                  })}
                </h3>
                <ChoiceGrid
                  aria-label={t(
                    f.prompt.kind === "capital" ? "sil.followUpCapital" : "sil.followUpFlag",
                    { name: target.name },
                  )}
                  stateLabels={{ correct: t("sil.followUpCorrect"), wrong: "✕", near: "" }}
                  shortcuts={false}
                  choices={f.prompt.options.map((opt, oi) => ({
                    id: String(oi),
                    label: label(opt),
                    disabled: answered,
                    ...(answered
                      ? {
                          state:
                            oi === f.prompt.correctIndex
                              ? ("correct" as const)
                              : oi === f.choice
                                ? ("wrong" as const)
                                : ("idle" as const),
                        }
                      : {}),
                  }))}
                  onChoose={(id) => onChange(answer(s, i, Number(id)))}
                />
                {answered && (
                  <p role="status">
                    {f.choice === f.prompt.correctIndex
                      ? t("sil.followUpCorrect")
                      : t("sil.followUpWrong", { answer: label(correctLabel) })}
                  </p>
                )}
              </div>
            );
          })}

          {s.phase === "learn" && (
            <Card className={styles.learn}>
              <h3>{t("sil.learn", { name: target.name })}</h3>
              <ul>
                <li>{t("sil.capital", { list: target.capitals.join(", ") })}</li>
                <li>
                  {(world.neighbors.get(target.id)?.size ?? 0) > 0
                    ? t("sil.neighbors", {
                        list: [...(world.neighbors.get(target.id) ?? [])]
                          .map((id) => world.byId.get(id)?.name ?? id)
                          .sort()
                          .join(", "),
                      })
                    : t("sil.noNeighbors")}
                </li>
                <li>
                  {t("sil.hint.area", {
                    area: fmt(target.areaKm2),
                    pct: (hintContent(world, target.id, 1) as { largerThanPercent: number })
                      .largerThanPercent,
                  })}
                </li>
              </ul>
              <p className={styles.note}>{t("sil.distanceNote")}</p>
              <p className={styles.meta}>
                {t("sil.points", { n: points(s) })} · {followUpsCorrect(s)}/{s.followUps.length}
              </p>
              <Button
                variant="primary"
                onPress={() => {
                  onChange(next(world, s, Date.now()));
                  setText("");
                }}
              >
                {t("sil.next")}
              </Button>
            </Card>
          )}
        </section>
      )}
    </div>
  );
}

function sessionPoints(s: Session): number {
  return s.done.reduce((sum, r) => sum + pointsOf(r), 0);
}
function pointsOf(r: Session["done"][number]): number {
  return roundPoints(r.state, r.followUpsCorrect);
}
