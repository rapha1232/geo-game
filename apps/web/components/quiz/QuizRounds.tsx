"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card } from "@meridian/ui";
import {
  MATCH_PAIRS,
  allFound,
  finishTiles,
  pickMatch,
  toggleTile,
  type MatchRound,
  type TileRound,
} from "@meridian/quiz";
import { t } from "../../lib/i18n";
import { assembleQuiz, loadQuizPacks, type LoadedQuiz } from "../../lib/quiz/data";
import { roundResult } from "../../lib/quiz/round-results";
import {
  findRound,
  newRoundSession,
  roundPbKey,
  roundPoints,
  type RoundQuiz,
  type RoundSession,
} from "../../lib/quiz/rounds";
import { loadBest, saveRankIt } from "../../lib/results/rank-it";
import { randomUlid } from "../../lib/results/ulid";
import { LoadFailure, LoadingState } from "../shell/LoadState";
import { useServices } from "../shell/StorageProvider";
import styles from "./quiz.module.css";
import "../../lib/messages/qz";

const newSeed = (): string => {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => "0123456789ABCDEFGHJKMNPQRSTVWXYZ"[b % 32]).join("");
};
const over = (s: RoundSession): boolean => s.round.status !== "playing";

/** Select-all tiles and two-column matching (quiz-library §2.2). Saves after every action and writes the result at the end. */
export function QuizRounds({ slug }: { slug: string }) {
  const services = useServices();
  const quiz: RoundQuiz | undefined = findRound(slug);
  const [data, setData] = useState<LoadedQuiz | null>(null);
  const [session, setSession] = useState<RoundSession | null>(null);
  const [lives, setLives] = useState<0 | 1 | 3>(0);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [best, setBest] = useState<number | null>(null);
  const [newBest, setNewBest] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const seq = useRef(0);
  const version = useRef("");
  const gameId = `quiz:round:${slug}`;

  useEffect(() => {
    if (!services || !quiz) return;
    let live = true;
    setError(false);
    void (async () => {
      try {
        const manifest = await services.loader.manifest();
        const { packs, edges } = await loadQuizPacks(services.loader);
        const loaded = assembleQuiz(packs, edges);
        version.current = manifest.current;
        const saved = await services.store.find(gameId);
        seq.current = saved?.seq ?? 0;
        if (!live) return;
        setData(loaded);
        if (saved && saved.content_version === manifest.current) {
          const s = saved.state as RoundSession;
          setSession({
            ...s,
            timer: { elapsedMs: s.timer.elapsedMs, runningSince: Date.now() },
            resumed: true,
          });
        }
      } catch {
        if (live) setError(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [services, quiz, gameId, attempt]);

  const key = session ? roundPbKey(session.slug, session.lives) : null;
  useEffect(() => {
    if (!services || !key) return setBest(null);
    void loadBest(services.db, key).then(setBest);
  }, [services, key]);

  const persist = useCallback(
    (s: RoundSession) => {
      services?.store.save({
        game_id: gameId,
        seq: ++seq.current,
        updated_at: Date.now(),
        content_version: version.current,
        title: quiz?.title ?? t("qz.title"),
        progress: t("qz.round.inProgress"),
        href: `/play/quiz/${slug}`,
        state: s,
      });
    },
    [services, gameId, quiz, slug],
  );
  const update = useCallback(
    (s: RoundSession) => {
      setSession(s);
      persist(s);
    },
    [persist],
  );

  // Write the result once, when the round is over.
  useEffect(() => {
    if (!services || !session || !over(session) || session.resultId) return;
    const now = Date.now();
    const id = randomUlid(now);
    const marked = { ...session, resultId: id };
    setSession(marked);
    persist(marked);
    void saveRankIt(services.db, {
      result: roundResult(session, { id, contentVersion: version.current, endedAt: now }),
    }).then((r) => {
      setNewBest(r.newBest);
      if (key) void loadBest(services.db, key).then(setBest);
    });
  }, [services, session, persist, key]);

  if (!quiz) return <p role="alert">{t("notFound.body")}</p>;
  if (error)
    return (
      <LoadFailure
        className={styles.page}
        message={t("qz.loadError")}
        onRetry={() => setAttempt((n) => n + 1)}
      />
    );
  if (!data) return <LoadingState className={styles.page}>{t("qz.loading")}</LoadingState>;

  const start = () => {
    setNewBest(false);
    update(newRoundSession(data.world, quiz, newSeed(), lives || undefined, Date.now()));
  };
  const name = (id: string): string => data.world.byId.get(id)?.name ?? id;
  const capital = (id: string): string => data.world.byId.get(id)?.capitals[0]?.name ?? id;

  if (!session)
    return (
      <section className={styles.page}>
        <h1>{quiz.title}</h1>
        <p>{quiz.prompt}</p>
        <label>
          {t("qz.config.lives")}
          <select value={lives} onChange={(e) => setLives(Number(e.target.value) as 0 | 1 | 3)}>
            <option value={0}>{t("qz.lives.unlimited")}</option>
            <option value={3}>{t("qz.lives.three")}</option>
            <option value={1}>{t("qz.lives.one")}</option>
          </select>
        </label>
        <div>
          <Button variant="primary" onPress={start}>
            {t("qz.round.start")}
          </Button>
        </div>
      </section>
    );

  const r = session.round;
  const done = over(session);
  const points = roundPoints(r);
  return (
    <section className={styles.page}>
      <h1>{quiz.title}</h1>
      <p>{quiz.prompt}</p>
      {r.lives !== undefined && (
        <p aria-live="polite">
          <span aria-hidden="true">{"♥".repeat(r.lives)}</span>{" "}
          {r.lives === 1 ? t("qz.life") : t("qz.lives", { n: r.lives })}
        </p>
      )}

      {r.kind === "tiles" ? (
        <Tiles
          round={r}
          name={name}
          done={done}
          onToggle={(id) => update({ ...session, round: toggleTile(r, id) })}
        />
      ) : (
        <Match
          round={r}
          name={name}
          capital={capital}
          flash={flash}
          onPick={(side, id) => {
            const res = pickMatch(r, side, id);
            setFlash(res.result === "wrong" ? id : null);
            update({ ...session, round: res.round });
          }}
        />
      )}
      <p role="status" className={styles.srOnly}>
        {r.kind === "tiles"
          ? t("qz.round.selected", { n: r.selected.length })
          : t("qz.round.paired", { n: r.matched.length, total: MATCH_PAIRS })}
      </p>

      {!done && r.kind === "tiles" && (
        <Button
          variant="primary"
          isDisabled={r.selected.length === 0 && !allFound(r)}
          onPress={() => update({ ...session, round: finishTiles(r) })}
        >
          {t("qz.round.done")}
        </Button>
      )}

      {done && (
        <Card className={styles.review} aria-live="polite">
          <h2>{t("qz.round.score", { n: points })}</h2>
          {r.status === "lives_out" && <p>{t("qz.reviewLivesOut")}</p>}
          {best !== null && <p>{t("qz.round.best", { n: Math.max(best, points) })}</p>}
          {newBest && <p>{t("qz.round.newBest")}</p>}
          <Button
            variant="primary"
            onPress={() => {
              setSession(null);
              void services?.store.discard(gameId);
            }}
          >
            {t("qz.round.again")}
          </Button>
        </Card>
      )}
    </section>
  );
}

function Tiles({
  round: r,
  name,
  done,
  onToggle,
}: {
  round: TileRound;
  name: (id: string) => string;
  done: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <ul className={styles.tiles} aria-label={t("qz.round.tiles")}>
      {r.tiles.map((id) => {
        const picked = r.selected.includes(id);
        const isRight = r.correct.includes(id);
        const mark = !done
          ? picked
            ? "●"
            : ""
          : isRight
            ? picked
              ? "✓"
              : "◐"
            : picked
              ? "✕"
              : "";
        const note = !done
          ? ""
          : isRight
            ? picked
              ? t("qz.round.right")
              : t("qz.round.missed")
            : picked
              ? t("qz.round.wrong")
              : "";
        return (
          <li key={id}>
            <button
              type="button"
              className={styles.tile}
              aria-pressed={picked}
              disabled={done}
              data-result={
                done
                  ? isRight
                    ? picked
                      ? "right"
                      : "missed"
                    : picked
                      ? "wrong"
                      : "none"
                  : undefined
              }
              onClick={() => onToggle(id)}
            >
              {mark && <span aria-hidden="true">{mark} </span>}
              {name(id)}
              {note && <small> {note}</small>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Match({
  round: r,
  name,
  capital,
  flash,
  onPick,
}: {
  round: MatchRound;
  name: (id: string) => string;
  capital: (id: string) => string;
  flash: string | null;
  onPick: (side: "left" | "right", id: string) => void;
}) {
  const done = r.status !== "playing";
  return (
    <div className={styles.match}>
      <ul aria-label={t("qz.round.countries")}>
        {r.left.map((id) => (
          <li key={id}>
            <button
              type="button"
              className={styles.tile}
              aria-pressed={r.pending === id}
              disabled={done || r.matched.includes(id)}
              data-result={r.matched.includes(id) ? "right" : undefined}
              onClick={() => onPick("left", id)}
            >
              {r.matched.includes(id) && <span aria-hidden="true">✓ </span>}
              {name(id)}
            </button>
          </li>
        ))}
      </ul>
      <ul aria-label={t("qz.round.capitals")}>
        {r.right.map((id) => (
          <li key={id}>
            <button
              type="button"
              className={styles.tile}
              disabled={done || r.matched.includes(id)}
              data-result={r.matched.includes(id) ? "right" : flash === id ? "wrong" : undefined}
              onClick={() => onPick("right", id)}
            >
              {r.matched.includes(id) && <span aria-hidden="true">✓ </span>}
              {flash === id && <span aria-hidden="true">✕ </span>}
              {capital(id)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
