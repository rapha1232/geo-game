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
import { QuizSlots } from "./QuizSlots";
import styles from "./quiz.module.css";
import "../../lib/messages/qz";

const flagSrc = (svg: string): string =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export type QuizPlayProps = {
  /** The quiz name for the game bar. */
  title?: string;
  /** Where the game bar's back button goes. The session is saved, so leaving keeps the round. */
  exitHref?: string;
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
  /** Leave correct answers uncoloured and mark only missed countries with a dot. */
  missedDotsOnly?: boolean;
  onMissedDotsOnly?: (on: boolean) => void;
  onSession: (s: QuizSession) => void;
  /** Test seam: replaces the real map. */
  renderMap?: (p: {
    states: Record<string, MapFeatureState>;
    markers?: ReadonlySet<string>;
    mode: MapMode;
    onSelect?: ((id: string) => void) | undefined;
  }) => ReactNode;
};

const mono = (): number => performance.now();

/**
 * The play screen for every format (UX_AND_DESIGN §5.4): a docked game bar, the map filling the screen with the
 * prompt and answer field floating over it, and for Type-all quizzes the answer board under the map.
 */
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

  // The site header and tab bar step aside while a round is on screen (UX_AND_DESIGN §5.4).
  useEffect(() => {
    const root = document.documentElement;
    root.dataset["immersive"] = "quiz";
    // Focusing the answer field can scroll the page; a round always opens with the whole map in view.
    document.scrollingElement?.scrollTo?.({ top: 0 });
    return () => {
      delete root.dataset["immersive"];
    };
  }, []);

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
  const dotsOnly = p.missedDotsOnly === true;
  const { states, markers } = useMemo(() => {
    const out: Record<string, MapFeatureState> = {};
    const markers = new Set<string>();
    const countriesOf = (id: string): string[] => world.groupById.get(id)?.members.slice() ?? [id];
    s.items.forEach((it, i) => {
      const q = s.quiz.items[i] as QuizItem;
      const ids = format === "TYPE_ALL" ? [q.id] : countriesOf(q.id);
      if (it.status === "correct") {
        if (!dotsOnly) for (const id of ids) out[id] = "correct";
      } else if (it.status === "missed" || it.status === "revealed") {
        if (dotsOnly) for (const id of ids) markers.add(id);
        else for (const id of ids) out[id] = "wrong";
      } else if (it.highlighted) for (const id of ids) out[id] = "highlight";
    });
    if (item && s.phase !== "review" && item.prompt.kind === "highlight")
      for (const id of countriesOf(item.prompt.target)) out[id] = "highlight";
    if (flash) out[flash.id] = flash.state;
    return { states: out, markers };
  }, [s, world, format, item, flash, dotsOnly]);

  const left = timeLeftMs(s, now);
  const warn =
    left !== null && s.quiz.limitMs !== null && left <= Math.max(10_000, s.quiz.limitMs * 0.1);
  const paused = s.phase === "paused";

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

  const pct = total === 0 ? 0 : (doneCount / total) * 100;
  const dotToggle = p.onMissedDotsOnly && showMap && (
    <label className={styles.dotToggle}>
      <input
        type="checkbox"
        checked={dotsOnly}
        onChange={(e) => p.onMissedDotsOnly?.(e.target.checked)}
      />
      {t("qz.missedDots")}
    </label>
  );

  return (
    <div className={styles.play}>
      <header className={styles.gameBar}>
        {p.exitHref && (
          <a
            href={p.exitHref}
            className={styles.iconBtn as string}
            aria-label={t("qz.exit")}
            title={t("qz.exit")}
          >
            <Glyph name="back" />
          </a>
        )}
        {p.title && <p className={styles.gameTitle}>{p.title}</p>}
        {/* One segment per answer up to 60, a continuous bar beyond; the count beside it carries the number. */}
        <div
          className={styles.track}
          data-mode={total <= 60 ? "segments" : "bar"}
          aria-hidden="true"
        >
          {total <= 60 ? (
            Array.from({ length: total }, (_, i) => (
              <span key={i} {...(i < doneCount ? { "data-on": "" } : {})} />
            ))
          ) : (
            <span style={{ width: `${pct}%` }} />
          )}
        </div>
        <p className={styles.count} aria-label={t("qz.progress", { done: doneCount, total })}>
          {t("qz.progress", { done: doneCount, total })}
        </p>
        {s.lives !== undefined && (
          <p
            className={styles.lives}
            aria-label={s.lives === 1 ? t("qz.life") : t("qz.lives", { n: s.lives })}
          >
            <span aria-hidden="true">
              {"♥".repeat(s.lives)}
              {"♡".repeat(Math.max(0, (s.quiz.config.lives ?? 0) - s.lives))}
            </span>
          </p>
        )}
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
          <Button
            variant="ghost"
            className={styles.iconBtn as string}
            aria-label={paused ? t("qz.continue") : t("qz.pause")}
            onPress={() => withState(paused ? resume(s, mono()) : pause(s, mono()))}
          >
            <Glyph name={paused ? "play" : "pause"} />
          </Button>
          <Button
            variant="ghost"
            className={styles.iconBtn as string}
            aria-label={t("qz.giveUp")}
            aria-expanded={confirming}
            onPress={() => {
              if (confirming) return setConfirming(false);
              const big =
                left === null ||
                (s.quiz.limitMs ?? 0) === 0 ||
                left / (s.quiz.limitMs as number) > 0.1;
              if (big && doneCount > 0 && format === "TYPE_ALL") setConfirming(true);
              else withState(giveUp(s, mono()));
            }}
          >
            <Glyph name="flag" />
          </Button>
        </div>
        {confirming && (
          <div role="group" className={styles.confirmGroup} aria-label={t("qz.giveUpConfirm")}>
            <p>{t("qz.giveUpConfirm")}</p>
            <Button
              variant="primary"
              onPress={() => {
                setConfirming(false);
                withState(giveUp(s, mono()));
              }}
            >
              {t("qz.giveUpYes")}
            </Button>
            <Button onPress={() => setConfirming(false)}>{t("qz.giveUpNo")}</Button>
          </div>
        )}
      </header>

      <div className={styles.stage} data-map={showMap && !paused ? "on" : "off"}>
        {paused ? (
          <Card className={styles.dock} role="status">
            <h2>{t("qz.paused")}</h2>
            <Button variant="primary" onPress={() => withState(resume(s, mono()))}>
              {t("qz.continue")}
            </Button>
          </Card>
        ) : (
          <>
            {showMap &&
              (p.renderMap ? (
                p.renderMap({
                  states,
                  markers,
                  mode: mapMode,
                  onSelect: format === "MAP_CLICK" ? clicked : undefined,
                })
              ) : (
                <QuizMap
                  world={world}
                  items={s.quiz.items.map((it) => it.id)}
                  labelPoints={facts.labelPoints}
                  states={states}
                  markers={markers}
                  mode={mapMode}
                  {...(format === "MAP_CLICK" ? { onSelect: clicked } : {})}
                />
              ))}
            {showMap && format !== "TYPE_ALL" && dotToggle && (
              <div className={styles.mapChip}>{dotToggle}</div>
            )}

            <div className={styles.dock} data-kind={showMap ? "float" : "card"}>
              {showItem && format !== "TYPE_ALL" && promptNode(showItem)}

              {(format === "TYPE_ALL" || format === "TYPE_PROMPTED") && (
                <div className={styles.answerRow}>
                  <AnswerInput
                    label={t(askLabel as MessageKey)}
                    value={text}
                    onChange={typedChange}
                    onSubmit={typedSubmit}
                    status={status}
                    autoFocus
                  />
                </div>
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

              {(format === "TYPE_PROMPTED" || hintsAllowed(s)) && (
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
              )}
            </div>
          </>
        )}
      </div>

      {format === "TYPE_ALL" && (
        <QuizSlots world={world} session={session} itemName={itemName} aside={dotToggle} />
      )}
    </div>
  );
}

const GLYPHS = {
  back: <path d="m15 18-6-6 6-6" />,
  pause: <path d="M9 5v14M15 5v14" />,
  play: <path d="M8 5.5v13l10-6.5z" />,
  flag: <path d="M5 21V4h11l-2 4 2 4H5" />,
} as const;

/** Outline glyphs for the game bar, drawn like the Lucide set the rest of the UI uses. Decorative. */
function Glyph({ name }: { name: keyof typeof GLYPHS }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {GLYPHS[name]}
    </svg>
  );
}
