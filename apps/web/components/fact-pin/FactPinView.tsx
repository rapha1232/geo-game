"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Button, Card } from "@meridian/ui";
import {
  HINT_CAP,
  confirm,
  countryHintAllowed,
  currentFactId,
  currentRound,
  endlessStats,
  placePin,
  ratingOf,
  summary,
  takeHint,
  timeLeftMs,
  total,
  type Hint,
  type PinFact,
} from "@meridian/fact-pin";
import type { MapFeatureState } from "@meridian/ui";
import { t, type MessageKey } from "../../lib/i18n";
import { searchPlaces, type LoadedFactPin } from "../../lib/fact-pin/data";
import { advance, finishRun, type FactSession } from "../../lib/fact-pin/session";
import { FactPinMap } from "./FactPinMap";
import styles from "./fact-pin.module.css";

/** Where the answer is, for the map marker: the point itself, or the label point of the area. */
function targetPoint(data: LoadedFactPin, fact: PinFact): { lat: number; lon: number } | null {
  if (fact.target.type === "point")
    return { lat: fact.target.coords[0], lon: fact.target.coords[1] };
  if (fact.target.type === "entity") {
    const id = fact.target.id;
    const e = data.mapEntities.find((x) => x.id === id);
    return e ? { lat: e.labelPoint[0], lon: e.labelPoint[1] } : null;
  }
  return null;
}

export type FactPinViewProps = {
  data: LoadedFactPin;
  session: FactSession;
  /** Monotonic clock reading for the timer display. */
  now: number;
  onChange: (s: FactSession) => void;
  /** Monotonic ms for the engine timers. */
  clock: () => number;
  pb?: { isNew: boolean } | null;
  saved?: boolean;
  onPlayAgain: () => void;
  onShare?: (text: string) => void;
  shared?: boolean;
  /** Extra controls shown on a revealed fact (the report link). */
  revealSlot?: (fact: PinFact) => ReactNode;
  /** Shown under the summary (a finished daily's links). */
  summarySlot?: ReactNode;
};

/** The whole play screen: a pure view over a session. Every action is an engine call that returns the next session. */
export function FactPinView({
  data,
  session: s,
  now,
  onChange,
  clock,
  pb,
  saved = true,
  onPlayAgain,
  onShare,
  shared,
  revealSlot,
  summarySlot,
}: FactPinViewProps) {
  const [text, setText] = useState("");
  const run = s.run;
  const fact = data.byId.get(currentFactId(run));
  const round = currentRound(run);
  const asking = run.phase === "asking";
  const left = timeLeftMs(run, now);
  const suggestions = useMemo(
    () => (asking && text.trim() ? searchPlaces(data.places, text) : []),
    [asking, text, data.places],
  );
  const update = (next: FactSession["run"]) => onChange({ ...s, run: next });

  if (run.phase === "done") {
    const sum = summary(run);
    const rating = ratingOf(sum.total);
    const shareText = t("fp.shareText", {
      total: sum.total,
      max: sum.max,
      rating: t(`fp.rating.${rating}` as MessageKey),
    });
    return (
      <div className={styles.page}>
        <header className={styles.head}>
          <h1>{t("fp.title")}</h1>
        </header>
        <Card className={styles.card} aria-labelledby="fp-summary">
          <h2 id="fp-summary">{t("fp.summary.title")}</h2>
          <p className={styles.big}>{t("fp.summary.total", { total: sum.total, max: sum.max })}</p>
          <p>{t("fp.summary.rating", { rating: t(`fp.rating.${rating}` as MessageKey) })}</p>
          {pb?.isNew && <p role="status">{t("fp.summary.newBest")}</p>}
          {!saved && <p role="alert">{t("fp.summary.notSaved")}</p>}
          {s.recycled && <p className={styles.note}>{t("fp.recycled")}</p>}
          <ol className={styles.summaryRows} aria-label={t("fp.summary.title")}>
            {sum.rows.map((r, i) => {
              const label = data.byId.get(r.factId)?.answerLabel ?? r.factId;
              return (
                <li key={r.factId}>
                  {r.timedOut && r.distanceKm === 0 && r.score === 0
                    ? t("fp.summary.rowTimedOut", { n: i + 1, label, score: r.score })
                    : t("fp.summary.row", {
                        n: i + 1,
                        label,
                        score: r.score,
                        km: Math.round(r.distanceKm),
                      })}
                </li>
              );
            })}
          </ol>
          <div className={styles.row}>
            <Button variant="primary" onPress={onPlayAgain}>
              {t("fp.playAgain")}
            </Button>
            {onShare && <Button onPress={() => onShare(shareText)}>{t("fp.share")}</Button>}
          </div>
          {shared && <p role="status">{t("fp.shared")}</p>}
          {summarySlot}
        </Card>
      </div>
    );
  }
  if (!fact) return null;

  const result = round.result;
  const hintTaken = (h: Hint) => round.hints.includes(h);
  const states: Record<string, MapFeatureState> = {};
  if (asking && hintTaken("country")) for (const c of fact.countries ?? []) states[c] = "highlight";
  if (!asking && fact.target.type === "entity") states[fact.target.id] = "correct";
  const target = !asking ? targetPoint(data, fact) : null;
  const continentName = t(`sil.continent.${fact.continent}` as MessageKey);
  const stats = run.config.mode === "endless" ? endlessStats(run) : null;
  const lastFact = run.config.mode !== "endless" && run.index + 1 >= run.factIds.length;

  const place = (lat: number, lon: number) => {
    update(placePin(run, { lat, lon }));
    setText("");
  };
  const doConfirm = () => update(confirm(run, fact, data.areas, clock()));
  const go = () => {
    onChange(advance(data, s, clock()));
    setText("");
  };

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>{t("fp.title")}</h1>
        <p className={styles.meta}>
          {run.config.mode === "endless"
            ? t("fp.factN", { n: run.index + 1 })
            : t("fp.factOf", { n: run.index + 1, total: run.factIds.length })}{" "}
          · {t("fp.points", { n: total(run) })}
          {stats && stats.played > 0 && (
            <> · {t("fp.endless.stats", { avg: stats.average, streak: stats.bestStreak })}</>
          )}
        </p>
      </header>

      <Card className={styles.card}>
        <p className={styles.fact}>{fact.text}</p>
        {asking && left !== null && (
          <p
            className={`${styles.timer} ${left <= 5000 ? styles.timerLow : ""}`}
            aria-live="off"
            data-testid="fp-timer"
          >
            {t("fp.timeLeft", { s: Math.max(0, Math.ceil(left / 1000)) })}
          </p>
        )}
        {asking && (
          <section aria-label={t("fp.hints")} className={styles.row}>
            {hintTaken("continent") ? (
              <p role="status">
                {t("fp.hint.continentShown", { name: continentName })}{" "}
                {t("fp.hint.capNote", { cap: HINT_CAP.continent })}
              </p>
            ) : (
              <Button onPress={() => update(takeHint(run, fact, "continent"))}>
                {t("fp.hint.continent")}
              </Button>
            )}
            {countryHintAllowed(fact) &&
              (hintTaken("country") ? (
                <p role="status">
                  {t("fp.hint.countryShown", {
                    name: (fact.countries ?? []).map(data.countryName).join(", "),
                  })}{" "}
                  {t("fp.hint.capNote", { cap: HINT_CAP.country })}
                </p>
              ) : (
                <Button onPress={() => update(takeHint(run, fact, "country"))}>
                  {t("fp.hint.country")}
                </Button>
              ))}
          </section>
        )}
      </Card>

      <FactPinMap
        data={data}
        pin={round.pin}
        target={target}
        states={states}
        locked={!asking}
        onPin={(p) => place(p.lat, p.lon)}
      />

      {asking && (
        <div className={styles.search}>
          <label htmlFor="fp-place">{t("fp.search")}</label>
          <input
            id="fp-place"
            className={styles.input}
            type="text"
            value={text}
            autoComplete="off"
            aria-describedby="fp-place-hint"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const first = suggestions[0];
              if (first) place(first.lat, first.lon);
              else if (round.pin) doConfirm();
            }}
          />
          <p id="fp-place-hint" className={styles.note}>
            {t("fp.searchHint")}
          </p>
          {suggestions.length > 0 && (
            <ul className={styles.suggestions} aria-label={t("fp.suggestions")}>
              {suggestions.map((p) => (
                <li key={`${p.id}`}>
                  <button type="button" onClick={() => place(p.lat, p.lon)}>
                    {p.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p role="status" className={styles.note}>
            {round.pin ? t("fp.pinPlaced") : t("fp.noPin")}
          </p>
          <div className={styles.row}>
            <Button variant="primary" isDisabled={!round.pin} onPress={doConfirm}>
              {t("fp.confirm")}
            </Button>
          </div>
        </div>
      )}

      {!asking && result && (
        <Card className={styles.card} aria-live="polite">
          <h2>{t("fp.reveal.answer", { label: fact.answerLabel })}</h2>
          <div className={styles.result}>
            <p className={styles.big}>{t("fp.reveal.score", { score: result.score })}</p>
            <p>
              {!round.pin
                ? t("fp.reveal.noPin")
                : result.distanceKm === 0
                  ? t("fp.reveal.inside")
                  : t("fp.reveal.distance", { km: Math.round(result.distanceKm) })}
              {result.timedOut && round.pin ? ` · ${t("fp.reveal.timedOut")}` : ""}
            </p>
            {result.cap !== null && result.rawScore > result.cap && (
              <p className={styles.note}>
                {t("fp.reveal.capped", { raw: result.rawScore, cap: result.cap })}
              </p>
            )}
          </div>
          <p>{fact.reveal}</p>
          <section aria-label={t("fp.reveal.sources")}>
            <h3>{t("fp.reveal.sources")}</h3>
            <ul className={styles.sources}>
              {fact.sources.map((src) => (
                <li key={src.url}>
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t("fp.reveal.sourceLink", { title: src.title })}
                  >
                    {src.title}
                  </a>
                </li>
              ))}
            </ul>
          </section>
          <div className={styles.row}>
            <Button variant="primary" onPress={go}>
              {lastFact ? t("fp.seeSummary") : t("fp.next")}
            </Button>
            {run.config.mode === "endless" && (
              <Button onPress={() => onChange(finishRun(s))}>{t("fp.finish")}</Button>
            )}
            {revealSlot?.(fact)}
          </div>
        </Card>
      )}
    </div>
  );
}
