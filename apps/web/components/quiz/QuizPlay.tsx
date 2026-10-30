"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AnswerInput,
  Button,
  Card,
  ChoiceGrid,
  type MapFeatureState,
  type MapMode,
} from "@meridian/ui";
import { onInput, onTick, type Hold } from "@meridian/name-matcher";
import {
  CONTINENT_NAMES,
  applyMatch,
  choose,
  clickMap,
  currentIndex,
  giveUp,
  hintsAllowed,
  matchContext,
  optionLabel,
  pause,
  resume,
  skip,
  skipIsReveal,
  submitText,
  takeHint,
  timeLeftMs,
  MAX_TYPE_ALL_HINTS,
  type QuizItem,
  type QuizWorld,
} from "@meridian/quiz";
import { accessibleItem } from "../../lib/quiz/accessible";
import type { QuizFacts } from "../../lib/quiz/data";
import { formatClock } from "../../lib/quiz/library";
import { clickStatus, hintStatus, typeStatus, type Status } from "../../lib/quiz/messages";
import type { QuizSession } from "../../lib/quiz/session";
import { t, type MessageKey } from "../../lib/i18n";
import { QuizMap } from "./QuizMap";
import styles from "./quiz.module.css";

const flagSrc = (svg: string): string =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export type QuizPlayProps = {
  world: QuizWorld;
  facts: QuizFacts;
  neighbors: ReadonlyMap<string, ReadonlySet<string>>;
  /** SVG by country id, loaded for flag quizzes. */
  flags: Readonly<Record<string, string>> | null;
  session: QuizSession;
  /** Monotonic ms, re-rendered about four times a second. */
  now: number;
  /** "Choose without the map" for Find-it quizzes. */
  accessible: boolean;
  onSession: (s: QuizSession) => void;
  /** Test seam: replaces the real map. */
  renderMap?: (p: {
    states: Record<string, MapFeatureState>;
    mode: MapMode;
    onSelect?: ((id: string) => void) | undefined;
  }) => ReactNode;
};

const mono = (): number => performance.now();

/** The play screen for every format: header, prompt, input or choices, hints and the map. */
export function QuizPlay(p: QuizPlayProps) {
  const { world, facts, session, now, accessible } = p;
  const s = session.state;
  const { format, template } = s.quiz.config;
  const total = s.items.length;
  const doneCount = s.items.filter((i) => i.status !== "pending").length;
  const cur = currentIndex(s);
  const item: QuizItem | undefined = cur === null ? undefined : s.quiz.items[cur];

  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [hold, setHold] = useState<Hold>(null);
  const [confirming, setConfirming] = useState(false);
  const [flash, setFlash] = useState<{ id: string; state: MapFeatureState } | null>(null);
  const [shown, setShown] = useState<{
    index: number;
    chosen: number;
    correct: number;
    item: QuizItem;
  } | null>(null);
  const swap = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = useCallback((next: QuizSession) => p.onSession(next), [p]);
  const withState = useCallback((state: typeof s) => set({ ...session, state }), [set, session]);
  const itemName = useCallback(
    (id: string) =>
      s.quiz.universe === "capital"
        ? optionLabel(world, template, id)
        : (world.byId.get(id)?.name ?? world.groupById.get(id)?.name ?? id),
    [world, s.quiz.universe, template],
  );

  // Prefix-hold: after 700 ms with no keystroke the held item is accepted (quiz-library §5.2).
  useEffect(() => {
    if (!hold || format !== "TYPE_ALL" || s.phase === "review") return;
    const id = setInterval(() => {
      const r = onTick(world.indexes[s.quiz.universe], text, matchContext(s), mono(), hold);
      if (r) {
        const out = applyMatch(world, s, r, text, mono());
        setHold(null);
        setText("");
        setStatus(typeStatus(world, out.state, out.event, itemName));
        withState(out.state);
      }
    }, 100);
    return () => clearInterval(id);
  }, [hold, text, s, world, format, itemName, withState]);

  useEffect(
    () => () => {
      if (swap.current) clearTimeout(swap.current);
    },
    [],
  );

  // Wrong-click tooltip for 1.2 s and the pulse on a missed item for 1.5 s.
  const flashFor = (id: string, state: MapFeatureState, ms: number) => {
    setFlash({ id, state });
    setTimeout(() => setFlash((f) => (f?.id === id ? null : f)), ms);
  };

  const hintLeft = format === "TYPE_ALL" ? MAX_TYPE_ALL_HINTS - s.hintsUsed : null;
  const doHint = () => {
    const r = takeHint(world, s, mono());
    setStatus(hintStatus(r.event));
    withState(r.state);
  };

  // `H` highlights one unnamed item in TYPE_ALL, outside the text field.
  useEffect(() => {
    if (format !== "TYPE_ALL") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "h" || e.altKey || e.ctrlKey || e.metaKey) return;
      const el = e.target;
      if (el instanceof HTMLElement && (el.tagName === "INPUT" || el.isContentEditable)) return;
      doHint();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const typedChange = (value: string) => {
    setText(value);
    if (format !== "TYPE_ALL") return;
    const r = onInput(world.indexes[s.quiz.universe], value, matchContext(s), mono(), hold);
    setHold(r.hold);
    if (r.result.kind === "accept") {
      const out = applyMatch(world, s, r.result, value, mono());
      setText("");
      setHold(null);
      setStatus(typeStatus(world, out.state, out.event, itemName));
      withState(out.state);
    } else if (
      r.result.kind === "already-named" ||
      r.result.kind === "ambiguous" ||
      r.result.kind === "not-in-quiz"
    ) {
      // An exact match that cannot score still gets its message while typing (quiz-library §5.1 steps 3a, 3d, 3e).
      setStatus(
        typeStatus(world, s, applyMatch(world, s, r.result, value, mono()).event, itemName),
      );
    } else setStatus(null);
  };
  const typedSubmit = (value: string) => {
    const out = submitText(world, s, value, { submitted: true }, mono());
    setHold(null);
    setStatus(typeStatus(world, out.state, out.event, itemName));
    if (out.event.kind === "accepted" || out.event.kind === "wrong") setText("");
    withState(out.state);
  };

  const clicked = (id: string) => {
    const out = clickMap(s, id, mono());
    setStatus(clickStatus(world, out.event));
    if (out.event.kind === "wrong") flashFor(id, "wrong", 1200);
    if (out.event.kind === "missed")
      for (const a of out.event.answer.slice(0, 1)) flashFor(a, "highlight", 1500);
    withState(out.state);
  };

  const chosen = (index: number) => {
    if (!item || shown) return;
    const out = choose(s, index, mono());
    if (out.event.kind === "over") return;
    setShown({ index, chosen: index, correct: item.correctIndex as number, item });
    setStatus(
      out.event.kind === "correct"
        ? { tone: "success", text: t("qz.choiceCorrect") }
        : {
            tone: "error",
            text: t("qz.choiceWrong", {
              name: optionLabel(
                world,
                template,
                (item.options as string[])[item.correctIndex as number] as string,
              ),
            }),
          },
    );
    swap.current = setTimeout(() => {
      setShown(null);
      withState(out.state);
    }, 900);
  };

  // --- map states -------------------------------------------------------------------------------------------------
  const states = useMemo(() => {
    const out: Record<string, MapFeatureState> = {};
    const countriesOf = (id: string): string[] => world.groupById.get(id)?.members.slice() ?? [id];
    s.items.forEach((it, i) => {
      const q = s.quiz.items[i] as QuizItem;
      const ids = format === "TYPE_ALL" ? [q.id] : countriesOf(q.id);
      if (it.status === "correct") for (const id of ids) out[id] = "correct";
      else if (it.status === "missed" || it.status === "revealed")
        for (const id of ids) out[id] = "wrong";
      else if (it.highlighted) for (const id of ids) out[id] = "highlight";
    });
    if (item && s.phase !== "review" && item.prompt.kind === "highlight")
      for (const id of countriesOf(item.prompt.target)) out[id] = "highlight";
    if (flash) out[flash.id] = flash.state;
    return out;
  }, [s, world, format, item, flash]);

  const left = timeLeftMs(s, now);
  const warn =
    left !== null && s.quiz.limitMs !== null && left <= Math.max(10_000, s.quiz.limitMs * 0.1);
  const paused = s.phase === "paused";

  const continents = useMemo(() => {
    if (format !== "TYPE_ALL") return null;
    const m = new Map<string, { done: number; all: number }>();
    s.items.forEach((it, i) => {
      const c = world.byId.get((s.quiz.items[i] as QuizItem).id)?.continent ?? "";
      const row = m.get(c) ?? { done: 0, all: 0 };
      row.all++;
      if (it.status !== "pending") row.done++;
      m.set(c, row);
    });
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [format, s, world]);

  const askLabel =
    s.quiz.universe === "capital"
      ? "qz.typeLabelCapital"
      : s.quiz.universe === "group"
        ? "qz.typeLabelGroup"
        : "qz.typeLabel";

  // --- prompt -----------------------------------------------------------------------------------------------------
  const promptNode = (it: QuizItem): ReactNode => {
    const pr = it.prompt;
    if (pr.kind === "flag") {
      const svg = p.flags?.[pr.target];
      return (
        <div className={styles.prompt}>
          <h2>{t("qz.whichFlag")}</h2>
          {svg ? (
            <img className={styles.flag} src={flagSrc(svg)} alt={t("qz.flagAlt")} />
          ) : (
            <p role="status">{t("qz.loading")}</p>
          )}
        </div>
      );
    }
    if (pr.kind === "highlight")
      return (
        <div className={styles.prompt}>
          <h2>{t("qz.whichHighlighted")}</h2>
        </div>
      );
    if (pr.kind === "text") {
      const heading =
        format === "MAP_CLICK"
          ? t("qz.clickPrompt", { name: pr.text })
          : template === "capitals.by-country"
            ? t("qz.capitalOf", { name: pr.text })
            : template === "countries.by-capital"
              ? t("qz.countryOfCapital", { name: pr.text })
              : template === "countries.by-continent"
                ? t("qz.continentOf", { name: pr.text })
                : pr.text;
      return (
        <div className={styles.prompt}>
          <h2>{heading}</h2>
        </div>
      );
    }
    return null;
  };

  const showItem = shown?.item ?? item;
  const showMap =
    format === "TYPE_ALL" ||
    (format === "TYPE_PROMPTED" && showItem?.prompt.kind === "highlight") ||
    (format === "MAP_CLICK" && !accessible);
  const mapMode: MapMode =
    format === "MAP_CLICK" ? "select" : format === "TYPE_PROMPTED" ? "highlight" : "view";

  const acc = useMemo(
    () =>
      accessible && format === "MAP_CLICK" && item
        ? accessibleItem(world, facts, p.neighbors, item, s.quiz.seed)
        : null,
    [accessible, format, item, world, facts, p.neighbors, s.quiz.seed],
  );

  return (
    <div className={styles.play}>
      <header className={styles.playHead}>
        <p className={styles.count} aria-label={t("qz.progress", { done: doneCount, total })}>
          {t("qz.progress", { done: doneCount, total })}
        </p>
        <p className={`${styles.clock} ${warn ? styles.warn : ""}`} role="timer" aria-live="off">
          <span aria-hidden="true">{warn ? "⏱ " : ""}</span>
          {left === null
            ? t("qz.timeUsed", {
                time: formatClock(
                  s.timer.elapsedMs +
                    (s.timer.runningSince === null ? 0 : now - s.timer.runningSince),
                ),
              })
            : t("qz.timeLeft", { time: formatClock(left) })}
        </p>
        <div className={styles.headActions}>
          <Button onPress={() => withState(paused ? resume(s, mono()) : pause(s, mono()))}>
            {paused ? t("qz.continue") : t("qz.pause")}
          </Button>
          {confirming ? (
            <span role="group" aria-label={t("qz.giveUpConfirm")}>
              <Button variant="primary" onPress={() => withState(giveUp(s, mono()))}>
                {t("qz.giveUpYes")}
              </Button>
              <Button onPress={() => setConfirming(false)}>{t("qz.giveUpNo")}</Button>
            </span>
          ) : (
            <Button
              variant="ghost"
              onPress={() => {
                const big =
                  left === null ||
                  (s.quiz.limitMs ?? 0) === 0 ||
                  left / (s.quiz.limitMs as number) > 0.1;
                if (big && doneCount > 0 && format === "TYPE_ALL") setConfirming(true);
                else withState(giveUp(s, mono()));
              }}
            >
              {t("qz.giveUp")}
            </Button>
          )}
        </div>
      </header>

      {paused ? (
        <Card className={styles.card} role="status">
          <h2>{t("qz.paused")}</h2>
          <Button variant="primary" onPress={() => withState(resume(s, mono()))}>
            {t("qz.continue")}
          </Button>
        </Card>
      ) : (
        <div className={styles.body}>
          <div className={styles.controls}>
            {showItem && format !== "TYPE_ALL" && promptNode(showItem)}

            {(format === "TYPE_ALL" || format === "TYPE_PROMPTED") && (
              <AnswerInput
                label={t(askLabel as MessageKey)}
                value={text}
                onChange={typedChange}
                onSubmit={typedSubmit}
                status={status}
                autoFocus
              />
            )}

            {format === "MULTIPLE_CHOICE" && showItem?.options && (
              <>
                <ChoiceGrid
                  aria-label={t("qz.choose")}
                  stateLabels={{
                    correct: t("qz.stateCorrect"),
                    wrong: t("qz.stateWrong"),
                    near: "",
                  }}
                  choices={showItem.options.map((id, i) => {
                    const removed = !shown && s.items[currentIndex(s) ?? 0]?.removed?.includes(i);
                    return {
                      id: String(i),
                      label: optionLabel(world, template, id),
                      disabled: !!shown || !!removed,
                      ...(shown
                        ? {
                            state:
                              i === shown.correct
                                ? ("correct" as const)
                                : i === shown.chosen
                                  ? ("wrong" as const)
                                  : ("idle" as const),
                          }
                        : {}),
                    };
                  })}
                  onChoose={(id) => chosen(Number(id))}
                />
                <p role="status" className={styles.status}>
                  {status?.text ?? ""}
                </p>
              </>
            )}

            {format === "MAP_CLICK" && (
              <>
                {acc ? (
                  <>
                    <p className={styles.describe}>
                      <strong>{t("qz.accDescription")}: </strong>
                      {acc.description}
                    </p>
                    <ChoiceGrid
                      aria-label={t("qz.choose")}
                      stateLabels={{
                        correct: t("qz.stateCorrect"),
                        wrong: t("qz.stateWrong"),
                        near: "",
                      }}
                      choices={acc.options.map((id, i) => ({
                        id: String(i),
                        label: world.byId.get(id)?.name ?? world.groupById.get(id)?.name ?? id,
                      }))}
                      onChoose={(i) => clicked(acc.options[Number(i)] as string)}
                    />
                  </>
                ) : null}
                <p role="status" className={styles.status}>
                  {status?.text ?? ""}
                </p>
              </>
            )}

            <div className={styles.row}>
              {format === "TYPE_PROMPTED" && (
                <Button onPress={() => withState(skip(s, mono()))}>
                  {skipIsReveal(s) ? t("qz.reveal") : t("qz.skip")}
                </Button>
              )}
              {hintsAllowed(s) && (
                <Button onPress={doHint}>
                  {hintLeft === null ? t("qz.hint") : t("qz.hintsLeft", { n: hintLeft })}
                </Button>
              )}
            </div>
          </div>

          {showMap && (
            <div className={styles.mapCol}>
              {p.renderMap ? (
                p.renderMap({
                  states,
                  mode: mapMode,
                  onSelect: format === "MAP_CLICK" ? clicked : undefined,
                })
              ) : (
                <QuizMap
                  world={world}
                  labelPoints={facts.labelPoints}
                  states={states}
                  mode={mapMode}
                  {...(format === "MAP_CLICK" ? { onSelect: clicked } : {})}
                />
              )}
              {continents && (
                <ul className={styles.counts} aria-label={t("qz.countsHeading")}>
                  {continents.map(([c, v]) => (
                    <li key={c}>
                      {CONTINENT_NAMES[c] ?? c}{" "}
                      <strong>
                        {v.done}/{v.all}
                      </strong>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
