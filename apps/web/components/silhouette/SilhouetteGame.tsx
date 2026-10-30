"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@meridian/ui";
import { t } from "../../lib/i18n";
import { useServices } from "../shell/StorageProvider";
import { assemble, loadSilhouettePacks, type Loaded } from "../../lib/silhouette/data";
import {
  DEFAULT_CONFIG,
  newChallengeSession,
  newDailySession,
  newSession,
  restore,
  setClock,
  type Config,
  type Session,
} from "../../lib/silhouette/controller";
import { browserLocale, loadSettings, resolveUnits } from "../../lib/settings/settings";
import { loadHistory, loadMastery, saveRound } from "../../lib/results/save";
import { masteryUpdates, silhouetteResult } from "../../lib/results/silhouette";
import { randomUlid } from "../../lib/results/ulid";
import { dailySchedule, gameResult, type GameResult } from "@meridian/schemas";
import { browserOffsetMinutes, localDate, msToNextDay } from "../../lib/daily/time";
import { DAILY_GAME_ID } from "../daily/DailyHub";
import { DailySummary } from "../daily/DailySummary";
import { ChallengeError } from "@meridian/game-kit";
import { ChallengeSummary } from "../challenge/ChallengeSummary";
import {
  challengeTargets,
  difficultyOf,
  followUpsOf,
  parseSilhouetteChallenge,
  poolOf,
  type ParsedChallenge,
  type SilhouetteChallengeConfig,
} from "../../lib/challenges/silhouette";
import { SilhouetteView } from "./SilhouetteView";
import styles from "./silhouette.module.css";

export const GAME_ID = "silhouette";

const newSeed = (): string => {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => "0123456789ABCDEFGHJKMNPQRSTVWXYZ"[b % 32]).join("");
};
const poolKey = (c: Config): string =>
  `${c.pool.kind}${c.pool.kind === "continent" ? `:${c.pool.continent}` : ""}|${c.difficulty}`;

/**
 * Loads the packs, restores an unfinished session if there is one, saves after every action (AC-SH-016), keeps the
 * active-time clock honest, and writes the result and mastery when a round ends (AC-PL-010).
 */
export const CHALLENGE_GAME_ID = "silhouette:challenge";

export function SilhouetteGame({
  daily = false,
  practice = false,
  challenge,
}: {
  daily?: boolean;
  practice?: boolean;
  /** A long challenge code from the URL. */
  challenge?: string;
}) {
  const services = useServices();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const seq = useRef(0);
  const [finished, setFinished] = useState<GameResult | null>(null);
  const [notice, setNotice] = useState<"invalid" | "approx" | null>(null);
  const [seenBefore, setSeenBefore] = useState(false);
  const [challengeConfig, setChallengeConfig] = useState<SilhouetteChallengeConfig | null>(null);
  const gameId = challenge ? CHALLENGE_GAME_ID : daily && !practice ? DAILY_GAME_ID : GAME_ID;
  const persistent = !(daily && practice);
  const version = useRef("");

  useEffect(() => {
    if (!services) return;
    let live = true;
    setError(false);
    void (async () => {
      try {
        const manifest = await services.loader.manifest();
        let parsed: ParsedChallenge | null = null;
        if (challenge) {
          try {
            parsed = parseSilhouetteChallenge(challenge);
          } catch (e) {
            if (e instanceof ChallengeError) return live && setNotice("invalid");
            throw e;
          }
        }
        // A challenge from an older release loads that release's packs while they are kept, else today's (approximately the same).
        let packVersion = manifest.current;
        let data: Loaded;
        if (parsed && parsed.payload.cv !== manifest.current) {
          try {
            data = assemble(await loadSilhouettePacks(services.loader, parsed.payload.cv));
            packVersion = parsed.payload.cv;
          } catch {
            data = assemble(await loadSilhouettePacks(services.loader));
            setNotice("approx");
          }
        } else data = assemble(await loadSilhouettePacks(services.loader));
        version.current = packVersion;
        const now = Date.now();
        let start: Session;
        let restored: Session | null = null;
        if (parsed) {
          const saved = await services.store.find(CHALLENGE_GAME_ID);
          const savedState = saved?.state as Session | undefined;
          seq.current = saved?.seq ?? 0;
          restored =
            savedState &&
            savedState.challenge?.code === challenge &&
            saved?.content_version === packVersion
              ? restore(savedState)
              : null;
          setChallengeConfig(parsed.config);
          setSeenBefore(
            !!(await services.db.seen.get(["challenge", parsed.payload.s]).catch(() => undefined)),
          );
          start =
            restored ??
            newChallengeSession(
              data.world,
              parsed.payload.s,
              {
                pool: poolOf(parsed.config),
                difficulty: difficultyOf(parsed.config),
                followUps: followUpsOf(parsed.config),
                unit: "km",
              },
              {
                code: challenge as string,
                targets: challengeTargets(data.world, parsed.config, parsed.payload.s),
                ...(parsed.payload.sc !== undefined ? { sc: parsed.payload.sc } : {}),
              },
              now,
            );
        } else if (daily) {
          const date = localDate(now, browserOffsetMinutes());
          const schedule = dailySchedule.parse(await services.loader.pack("daily.silhouette"));
          const targetId = schedule.days[date]?.[0];
          if (!targetId) throw new Error("no daily for today");
          const rows = await services.db.results.where("daily_date").equals(date).toArray();
          const played = rows.some((r) => {
            const p = gameResult.safeParse(r.data);
            return p.success && p.data.mode === "daily" && p.data.game_id === "silhouette";
          });
          if (played && !practice) {
            window.location.replace("/daily");
            return;
          }
          const saved = practice ? null : await services.store.find(DAILY_GAME_ID);
          const savedState = saved?.state as Session | undefined;
          restored =
            saved &&
            savedState &&
            savedState.config.date === date &&
            saved.content_version === manifest.current
              ? restore(savedState)
              : null;
          seq.current = saved?.seq ?? 0;
          start =
            restored ??
            (practice
              ? newDailySession(data.world, newSeed(), targetId, date, now, "practice")
              : newDailySession(
                  data.world,
                  date.replaceAll("-", "").padEnd(10, "0"),
                  targetId,
                  date,
                  now,
                ));
        } else {
          const saved = await services.store.find(GAME_ID);
          seq.current = saved?.seq ?? 0;
          restored =
            saved && saved.content_version === manifest.current
              ? restore(saved.state as Session)
              : null;
          start =
            restored ??
            newSession(
              data.world,
              newSeed(),
              DEFAULT_CONFIG,
              await loadHistory(services.db, GAME_ID, poolKey(DEFAULT_CONFIG)),
              now,
            );
        }
        // Distance units come from Settings, so a change applies to a round already in progress too.
        const unit = resolveUnits(await loadSettings(services.db), browserLocale());
        start = { ...start, config: { ...start.config, unit } };
        setLoaded(data);
        setSession(document.visibilityState === "visible" ? setClock(start, true, now) : start);
      } catch {
        if (live) setError(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [services, attempt, daily, practice, challenge]);

  const persist = useCallback(
    (next: Session) => {
      if (!services || !persistent) return;
      services.store.save({
        game_id: gameId,
        seq: ++seq.current,
        updated_at: Date.now(),
        content_version: version.current,
        title: t("sil.title"),
        progress: t("sil.round", { n: next.roundNo }),
        href: challenge
          ? `/play/silhouette/challenge?c=${challenge}`
          : daily
            ? "/play/silhouette/daily"
            : "/play/silhouette",
        state: next,
      });
    },
    [services, persistent, gameId, daily, challenge],
  );

  const update = useCallback(
    (next: Session) => {
      setSession(next);
      persist(next);
    },
    [persist],
  );

  // Pause the clock while the tab is hidden.
  useEffect(() => {
    const onVisibility = () =>
      setSession((s) => (s ? setClock(s, document.visibilityState === "visible", Date.now()) : s));
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Write the result once, when the round is fully over (guess, then follow-ups).
  useEffect(() => {
    if (!services || !loaded || !session || session.phase !== "learn" || session.resultId) return;
    const now = Date.now();
    const id = randomUlid(now);
    const marked: Session = { ...session, resultId: id };
    setSession(marked);
    persist(marked);
    void (async () => {
      const previous = await loadMastery(services.db, [session.round.targetId]);
      const result = silhouetteResult(session, {
        id,
        contentVersion: version.current,
        endedAt: now,
      });
      setFinished(result);
      if (challenge)
        void services.db.seen.put({ kind: "challenge", id: session.seed }).catch(() => undefined);
      await saveRound(services.db, {
        result,
        mastery: masteryUpdates(session, previous, now),
        ...(daily || challenge
          ? {}
          : {
              history: {
                game_id: GAME_ID,
                pool_key: poolKey(session.config),
                target_ids: session.history,
              },
            }),
      });
    })();
  }, [services, loaded, session, persist, daily, challenge]);

  if (notice === "invalid")
    return (
      <div className={styles.page} role="alert">
        <h1>{t("ch.invalidTitle")}</h1>
        <p>{t("ch.invalidBody")}</p>
        <a href="/play/silhouette">{t("ch.playAgain")}</a>
      </div>
    );
  if (error)
    return (
      <div className={styles.page} role="alert">
        <p>{t("sil.loadError")}</p>
        <Button onPress={() => setAttempt((n) => n + 1)}>{t("sil.retry")}</Button>
      </div>
    );
  if (!loaded || !session)
    return (
      <div className={styles.page} role="status">
        {t("sil.loading")}
      </div>
    );
  return (
    <>
      {notice === "approx" && (
        <p role="status" className={styles.page}>
          {t("ch.oldVersion")}
        </p>
      )}
      <SilhouetteView
        session={session}
        world={loaded.world}
        shapes={loaded.shapes}
        contentVersion={version.current}
        onChange={(next) => update(next)}
        {...(daily && !practice && finished
          ? {
              endSlot: (
                <DailySummary
                  result={finished}
                  link={`${window.location.origin}/daily`}
                  msToNext={msToNextDay(Date.now(), browserOffsetMinutes())}
                />
              ),
            }
          : {})}
        {...(challenge && challengeConfig
          ? {
              finishedSlot: (
                <ChallengeSummary
                  session={session}
                  config={challengeConfig}
                  contentVersion={version.current}
                  origin={window.location.origin}
                  seenBefore={seenBefore}
                />
              ),
            }
          : {})}
      />
    </>
  );
}
