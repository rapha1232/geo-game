"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnswerInput, Button, GameMap, type Lod, type MapFeatureState } from "@meridian/ui";
import {
  clickSub,
  currentPrompt,
  giveUpSub,
  newFind,
  newNameAll,
  subScore,
  submitName,
  type FindRound,
  type SubRound,
} from "@meridian/quiz";
import { t } from "../../lib/i18n";
import { LoadFailure, LoadingState } from "../shell/LoadState";
import { useServices } from "../shell/StorageProvider";
import { loadSubdivisions, type LoadedSubdivisions } from "../../lib/subdivisions/data";
import { findSubCountry, pluralKind, subTitle } from "../../lib/subdivisions/list";
import { subPbKey, subdivisionResult } from "../../lib/results/subdivisions";
import { loadBest, saveRankIt } from "../../lib/results/rank-it";
import { randomUlid } from "../../lib/results/ulid";
import styles from "./subdivisions.module.css";
import g from "../game/game.module.css";
import { GameBar, TitleCard } from "../game/GameBar";
import "../../lib/messages/qz";
import "../../lib/messages/sb";
import { mapLabels } from "../../lib/map/labels";

const LABELS = mapLabels();
type Format = "name" | "find";
type Played = { round: SubRound; seed: string; startedAt: number; resultId: string | null };

const newSeed = (): string => {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => "0123456789ABCDEFGHJKMNPQRSTVWXYZ"[b % 32]).join("");
};

/** Name every state, province or region of a country, or find each on the map. Saves as it goes and writes the result at the end. */
export function SubdivisionGame({ code }: { code: string }) {
  const services = useServices();
  const country = findSubCountry(code);
  const [data, setData] = useState<LoadedSubdivisions | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [format, setFormat] = useState<Format>("name");
  const [played, setPlayed] = useState<Played | null>(null);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ id: string; state: MapFeatureState } | null>(null);
  const [lods, setLods] = useState<Partial<Record<Lod, never>>>({});
  const [best, setBest] = useState<number | null>(null);
  const [newBest, setNewBest] = useState(false);
  const seq = useRef(0);
  const version = useRef("");
  const gameId = `quiz:sub:${code.toUpperCase()}`;

  useEffect(() => {
    if (!services || !country) return;
    let live = true;
    setError(false);
    void (async () => {
      try {
        const manifest = await services.loader.manifest();
        const loaded = await loadSubdivisions(services.loader, country.code);
        version.current = manifest.current;
        const saved = await services.store.find(gameId);
        seq.current = saved?.seq ?? 0;
        if (!live) return;
        setData(loaded);
        setLods({ "110m": loaded.topology as never });
        if (saved && saved.content_version === manifest.current) setPlayed(saved.state as Played);
      } catch {
        if (live) setError(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [services, country, gameId, attempt]);

  const key = played ? subPbKey(code.toUpperCase(), played.round.kind) : null;
  useEffect(() => {
    if (!services || !key) return setBest(null);
    void loadBest(services.db, key).then(setBest);
  }, [services, key]);

  const update = useCallback(
    (next: Played) => {
      setPlayed(next);
      services?.store.save({
        game_id: gameId,
        seq: ++seq.current,
        updated_at: Date.now(),
        content_version: version.current,
        title: country ? subTitle(country) : t("sb.title"),
        progress: next.round.status === "playing" ? t("qz.round.inProgress") : t("sb.title"),
        href: `/play/subdivisions/${code.toLowerCase()}`,
        state: next,
      });
    },
    [services, gameId, country, code],
  );

  // Write the result once, when the round ends.
  useEffect(() => {
    if (!services || !played || played.round.status === "playing" || played.resultId) return;
    const now = Date.now();
    const id = randomUlid(now);
    setPlayed({ ...played, resultId: id });
    void saveRankIt(services.db, {
      result: subdivisionResult(played.round, {
        id,
        seed: played.seed,
        contentVersion: version.current,
        startedAt: played.startedAt,
        endedAt: now,
      }),
    }).then((r) => {
      setNewBest(r.newBest);
      if (key) void loadBest(services.db, key).then(setBest);
    });
  }, [services, played, key]);

  const states = useMemo(() => {
    const out: Record<string, MapFeatureState> = {};
    if (!played) return out;
    const r = played.round;
    if (r.kind === "sub-name") {
      for (const id of r.found) out[id] = "correct";
      if (r.status === "gave_up") for (const id of r.ids) out[id] ??= "near";
    } else {
      for (const [id, score] of Object.entries(r.scores)) out[id] = score > 0 ? "correct" : "near";
      const target = currentPrompt(r);
      if (target && flash) out[flash.id] = flash.state;
    }
    return out;
  }, [played, flash]);

  if (!country) return <p role="alert">{t("notFound.body")}</p>;
  if (error)
    return (
      <LoadFailure
        className={styles.page}
        message={t("sb.loadError")}
        onRetry={() => setAttempt((n) => n + 1)}
      />
    );
  if (!data) return <LoadingState className={styles.page}>{t("sb.loading")}</LoadingState>;

  const name = (id: string): string => data.names.get(id) ?? id;
  const start = () => {
    const seed = newSeed();
    setNewBest(false);
    setMsg(null);
    update({
      round:
        format === "name"
          ? newNameAll(country.code, data.items)
          : newFind(country.code, data.items, seed),
      seed,
      startedAt: Date.now(),
      resultId: null,
    });
  };

  const r = played?.round;
  const over = r ? r.status !== "playing" : false;

  const submit = (value: string, submitted: boolean) => {
    if (!played || played.round.kind !== "sub-name") return;
    const res = submitName(played.round, data.index, value, submitted);
    if (res.event.kind === "accepted") {
      setText("");
      setMsg(null);
      update({ ...played, round: res.round });
    } else if (submitted) {
      setMsg(
        res.event.kind === "already"
          ? t("sb.alreadyNamed")
          : res.event.kind === "ambiguous"
            ? res.event.message
            : res.event.kind === "not-recognized"
              ? t("sb.notRecognized")
              : null,
      );
    }
  };
  const pick = (id: string) => {
    if (!played || played.round.kind !== "sub-find") return;
    const res = clickSub(played.round, id);
    if (res.event.kind === "wrong") {
      setMsg(t("sb.wrong", { name: name(id) }));
      setFlash({ id, state: "wrong" });
      setTimeout(() => setFlash(null), 1200);
    } else if (res.event.kind === "missed")
      setMsg(t("sb.missed", { name: name(res.event.answer) }));
    else if (res.event.kind === "correct") setMsg(t("sb.right"));
    update({ ...played, round: res.round });
  };

  if (!played)
    return (
      <TitleCard title={subTitle(country)} href="/play/subdivisions" pitch={t("sb.intro")}>
        <label className={styles.field}>
          {t("sb.format")}
          <select value={format} onChange={(e) => setFormat(e.target.value as Format)}>
            <option value="name">{t("sb.format.name")}</option>
            <option value="find">{t("sb.format.find")}</option>
          </select>
        </label>
        <div>
          <Button variant="primary" onPress={start}>
            {t("sb.start")}
          </Button>
        </div>
        <p className={styles.note}>
          {pluralKind(country.kind)} · {country.count}
        </p>
      </TitleCard>
    );

  const missedNames =
    r && over
      ? (r.kind === "sub-name"
          ? r.ids.filter((id) => !r.found.includes(id))
          : r.order.filter((id) => (r.scores[id] ?? 0) === 0)
        ).map(name)
      : [];
  const target = r && r.kind === "sub-find" ? currentPrompt(r) : null;

  return (
    <div className={`${styles.page} ${g.page}`}>
      <GameBar
        title={subTitle(country)}
        href="/play/subdivisions"
        backHref="/play/subdivisions"
        meta={
          <span aria-live="polite">
            {r?.kind === "sub-name"
              ? t("sb.count", { n: r.found.length, total: r.ids.length })
              : r
                ? t("sb.findProgress", {
                    n: Object.keys((r as FindRound).scores).length,
                    total: (r as FindRound).order.length,
                  })
                : ""}
          </span>
        }
      />
      <div className={g.split}>
        <div className={g.stage}>
          <div className={styles.mapBox}>
            <GameMap
              lods={lods}
              entities={data.entities}
              focus={data.entities.map((e) => e.id)}
              states={states}
              mode={r?.kind === "sub-find" && !over ? "select" : "view"}
              onSelect={pick}
              labels={LABELS}
              aria-label={t("sb.mapAria")}
            />
          </div>
        </div>
        <div className={g.panel}>
          {over && r && (
            <section
              className={`${styles.result} ${g.result} stage-dark`}
              data-hue="blue"
              aria-live="polite"
            >
              <h2>
                {r.status === "gave_up"
                  ? t("sb.gaveUp", { n: subScore(r) })
                  : t("sb.done", { n: subScore(r) })}
              </h2>
              {missedNames.length > 0 && (
                <p>{t("sb.missedList", { list: missedNames.join(", ") })}</p>
              )}
              {best !== null && <p>{t("sb.best", { n: Math.max(best, subScore(r)) })}</p>}
              {newBest && <p>{t("sb.newBest")}</p>}
              <div className={styles.actions}>
                <Button
                  variant="primary"
                  onPress={() => {
                    void services?.store.discard(gameId);
                    setPlayed(null);
                  }}
                >
                  {t("sb.again")}
                </Button>
                <a href="/play/subdivisions">{t("sb.back")}</a>
              </div>
            </section>
          )}
          <div className={g.block}>
            <p className={g.label}>
              {pluralKind(country.kind)} · {country.count}
            </p>
            {target && (
              <p className={`${styles.prompt} ${g.prompt}`}>
                {t("sb.findPrompt", { name: name(target) })}{" "}
                <small>{t("sb.tries", { n: 3 - (r as FindRound).attempts })}</small>
              </p>
            )}
            {r?.kind === "sub-name" && !over && (
              <AnswerInput
                label={t("sb.input")}
                value={text}
                onChange={(v) => {
                  setText(v);
                  submit(v, false);
                }}
                onSubmit={(v) => submit(v, true)}
                status={msg ? { tone: "error", text: msg } : null}
                autoFocus
              />
            )}
            {r?.kind === "sub-find" && msg && !over && (
              <p role="status" className={styles.note}>
                {msg}
              </p>
            )}
            {!over && (
              <div>
                <Button
                  variant="ghost"
                  onPress={() => update({ ...played, round: giveUpSub(played.round) })}
                >
                  {t("sb.giveUp")}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
