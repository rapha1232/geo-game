"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnswerInput, Button, Card, GameMap, type Lod, type MapFeatureState } from "@meridian/ui";
import type { Topology } from "topojson-specification";
import {
  MAX_RUN_POINTS,
  TIERS,
  TIER_GLYPH,
  TIER_POINTS,
  answerCount,
  byTier,
  oneSolid,
  provisional,
  total,
  type Tier,
} from "@meridian/deep-cut";
import { norm } from "@meridian/name-matcher";
import { t, type MessageKey } from "../../lib/i18n";
import type { LoadedDeepCut } from "../../lib/deep-cut/data";
import { lockIn, next, pick, tickTime, type Session } from "../../lib/deep-cut/controller";
import { useServices } from "../shell/StorageProvider";
import styles from "./deep-cut.module.css";
import "../../lib/messages/dc";
import "../../lib/messages/rk";
import "../../lib/messages/sil";
import { mapLabels } from "../../lib/map/labels";

const LABELS = mapLabels();
const tierName = (tier: Tier): string => t(`dc.tier.${tier}` as MessageKey);

/** Share text: one glyph per prompt and the total, never the prompts or answers. */
export const shareText = (s: Session): string =>
  [
    t("dc.share", { n: total(s.run), max: MAX_RUN_POINTS }),
    s.run.prompts.map((p) => (p.tier ? TIER_GLYPH[p.tier] : "✕")).join(" "),
  ].join("\n");

export type DeepCutViewProps = {
  session: Session;
  data: LoadedDeepCut;
  onChange: (s: Session) => void;
  onAgain: () => void;
  contentVersion?: string;
  /** Shown under the summary instead of Play again (a finished daily shows its own summary). */
  endSlot?: ReactNode;
};

/** The whole play screen. Pure over a Session; the timer's ticks come from the container through `onChange`. */
export function DeepCutView({ session: s, data, onChange, onAgain, endSlot }: DeepCutViewProps) {
  const services = useServices();
  const [text, setText] = useState("");
  const [lods, setLods] = useState<Partial<Record<Lod, Topology>>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [solid, setSolid] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const done = s.run.status === "done";
  const play = s.run.prompts[s.run.index]!;
  const prompt = data.byId.get(play.promptId)!;
  const name = (id: string): string => data.world.byId.get(id)?.name ?? id;

  useEffect(() => {
    let live = true;
    void services?.loader
      .pack<Topology>("geo.world.110m")
      .then((p) => live && setLods({ "110m": p }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [services]);
  useEffect(() => {
    setText("");
    setMsg(null);
    setSolid(null);
  }, [s.run.index]);

  // The countdown. A prompt with no selection at zero scores nothing; with one, it is locked in.
  useEffect(() => {
    if (s.phase !== "prompt" || s.remainingMs === null || done) return;
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const ticked = tickTime(s, 250);
      onChange(ticked.remainingMs === 0 ? lockIn(data, ticked, true, performance.now()) : ticked);
    }, 250);
    return () => clearInterval(id);
  });

  const entities = useMemo(
    () =>
      data.world.entities
        .filter((e) => e.type === "country" && e.sets.includes("sovereign-197"))
        .map((e) => ({ id: e.id, name: e.name, labelPoint: data.labelPoints.get(e.id) ?? [0, 0] })),
    [data],
  );
  const tiers = useMemo(
    () => new Map(Object.entries(play.tiers)) as Map<string, Tier>,
    [play.tiers],
  );
  const grouped = useMemo(() => byTier(tiers), [tiers]);

  const states = useMemo(() => {
    const out: Record<string, MapFeatureState> = {};
    if (s.phase === "reveal") {
      for (const id of tiers.keys()) out[id] = "correct";
      if (play.answer) out[play.answer] = tiers.has(play.answer) ? "highlight" : "wrong";
    } else if (play.selection) out[play.selection] = "highlight";
    return out;
  }, [s.phase, tiers, play.answer, play.selection]);

  const suggestions =
    text.trim() === ""
      ? []
      : data.world.entities
          .filter(
            (e) =>
              e.type === "country" &&
              e.sets.includes("sovereign-197") &&
              [
                e.name,
                ...e.aliases
                  .filter((a) => a.kind !== "translation" && a.kind !== "code")
                  .map((a) => a.text),
              ].some((n) => norm(n).startsWith(norm(text))),
          )
          .slice(0, 6);

  const choose = (id: string) => {
    setMsg(null);
    onChange(pick(s, id));
  };
  const submitText = (value: string) => {
    const all = new Set(entities.map((e) => e.id));
    const r = data.world.indexes.country.match(
      value,
      {
        mode: "type_prompted",
        remaining: all,
        promptAnswers: all,
        inQuiz: all,
        strictness: "standard",
        named: new Set(),
      },
      { submitted: true },
    );
    if (r.kind === "accept" || r.kind === "wrong" || r.kind === "hold") {
      choose(r.entityId);
      setText("");
    } else if (r.kind === "ambiguous") setMsg(r.message);
    else if (r.kind !== "ignore") setMsg(t("dc.notRecognized"));
  };

  if (done)
    return (
      <div className={styles.page}>
        <header className={styles.head}>
          <h1>{t("dc.title")}</h1>
        </header>
        <Card className={styles.reveal}>
          <h2>{t("dc.summary")}</h2>
          <p className={styles.prompt}>
            {t("dc.summary.total", { n: total(s.run), max: MAX_RUN_POINTS })}
          </p>
          <ol className={styles.tiers}>
            {s.run.prompts.map((p, i) => (
              <li key={p.promptId}>
                {p.tier
                  ? t("dc.summary.row", {
                      n: i + 1,
                      glyph: TIER_GLYPH[p.tier],
                      tier: tierName(p.tier),
                      points: p.points,
                    })
                  : t("dc.summary.none", { n: i + 1 })}
              </li>
            ))}
          </ol>
          {provisional(s.run) && <p className={styles.note}>{t("dc.reveal.provisional")}</p>}
          <pre className={styles.share} aria-label={t("dc.copy")}>
            {shareText(s)}
          </pre>
          <div className={styles.actions}>
            <Button
              variant="primary"
              onPress={() => {
                void navigator.clipboard.writeText(shareText(s)).then(
                  () => setCopied(true),
                  () => undefined,
                );
              }}
            >
              {t("dc.copy")}
            </Button>
            {!endSlot && <Button onPress={onAgain}>{t("dc.again")}</Button>}
          </div>
          <p role="status" className={styles.note}>
            {copied ? t("dc.copied") : ""}
          </p>
        </Card>
        {endSlot}
      </div>
    );

  const reveal = s.phase === "reveal";
  const practice = s.run.mode === "practice";
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1>{t("dc.title")}</h1>
        <p className={styles.meta}>
          {t("dc.prompt", { n: s.run.index + 1, total: s.run.prompts.length })} ·{" "}
          <span role="timer" aria-live="off">
            {s.remainingMs === null
              ? t("dc.timeOff")
              : t("dc.time", { n: Math.ceil(s.remainingMs / 1000) })}
          </span>{" "}
          · {t("rk.points", { n: total(s.run) })}
        </p>
      </header>
      <p className={styles.prompt}>{prompt.text}</p>
      <p className={styles.srOnly} role="status" aria-live="polite">
        {!reveal &&
        s.remainingMs !== null &&
        s.remainingMs > 0 &&
        s.remainingMs <= 10_250 &&
        s.remainingMs > 9_750
          ? t("dc.warn")
          : ""}
      </p>

      <div className={styles.mapBox}>
        <GameMap
          lods={lods}
          entities={entities}
          states={states}
          mode={reveal ? "view" : "select"}
          onSelect={choose}
          labels={LABELS}
          aria-label={t("dc.mapAria")}
        />
      </div>

      {!reveal && (
        <>
          <p className={styles.chip} aria-live="polite">
            {play.selection ? t("dc.selected", { name: name(play.selection) }) : t("dc.none")}
          </p>
          <AnswerInput
            label={t("dc.input")}
            value={text}
            onChange={setText}
            onSubmit={submitText}
            status={msg ? { tone: "error", text: msg } : null}
          />
          {suggestions.length > 0 && (
            <ul className={styles.suggestions} aria-label={t("sil.suggestions")}>
              {suggestions.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => {
                      choose(e.id);
                      setText("");
                    }}
                  >
                    {e.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className={styles.actions}>
            <Button
              variant="primary"
              isDisabled={!play.selection}
              onPress={() => onChange(lockIn(data, s, false, performance.now()))}
            >
              {t("dc.lock")}
            </Button>
            {practice && (
              <Button onPress={() => setSolid(oneSolid(s.run))}>{t("dc.practice.solid")}</Button>
            )}
          </div>
          {practice && (
            <p className={styles.note}>
              {t("dc.practice.count", {
                n: answerCount({ prompt: (id) => data.byId.get(id) }, prompt.id),
              })}
              {solid ? ` · ${t("dc.practice.solidShown", { name: name(solid) })}` : ""}
            </p>
          )}
        </>
      )}

      {reveal && (
        <Card className={styles.reveal} aria-live="polite">
          <h2>
            {play.tier
              ? practice
                ? t("dc.reveal.practice", {
                    glyph: TIER_GLYPH[play.tier],
                    tier: tierName(play.tier),
                  })
                : t("dc.reveal.valid", {
                    glyph: TIER_GLYPH[play.tier],
                    tier: tierName(play.tier),
                    points: TIER_POINTS[play.tier],
                  })
              : play.answer
                ? t("dc.reveal.invalid")
                : t("dc.reveal.timeout")}
          </h2>
          {s.lastLock?.message && <p>{s.lastLock.message}</p>}
          <h3>{t("dc.reveal.all")}</h3>
          <ul className={styles.tiers}>
            {TIERS.flatMap((tier) =>
              grouped[tier].map((id) => (
                <li key={id} data-yours={id === play.answer}>
                  <span aria-hidden="true">{TIER_GLYPH[tier]}</span> {tierName(tier)}: {name(id)}
                  {id === play.answer && (
                    <span className={styles.you}> · {t("dc.reveal.you")}</span>
                  )}
                </li>
              )),
            )}
          </ul>
          <p className={styles.note}>{prompt.explanation}</p>
          {play.calibrationN === 0 && <p className={styles.note}>{t("dc.reveal.provisional")}</p>}
          <Button variant="primary" onPress={() => onChange(next(s, performance.now()))}>
            {t("dc.next")}
          </Button>
        </Card>
      )}
    </div>
  );
}
