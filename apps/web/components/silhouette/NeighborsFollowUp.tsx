"use client";

import { useEffect, useMemo, useState } from "react";
import { AnswerInput, Button, GameMap, type Lod, type MapFeatureState } from "@meridian/ui";
import type { Topology } from "topojson-specification";
import { suggest, type NeighborsPrompt, type World } from "@meridian/silhouette";
import { t } from "../../lib/i18n";
import type { FollowUpState } from "../../lib/silhouette/controller";
import { useServices } from "../shell/StorageProvider";
import styles from "./silhouette.module.css";
import "../../lib/messages/sil";
import { mapLabels } from "../../lib/map/labels";

const LABELS = mapLabels();

/**
 * The Neighbors follow-up (silhouette §8.2): select every land neighbour on the map, or add them by name. Scored only if
 * every neighbour is selected and nothing else. One attempt.
 */
export function NeighborsFollowUp({
  world,
  state,
  onSubmit,
}: {
  world: World;
  state: FollowUpState;
  onSubmit: (picks: string[]) => void;
}) {
  const services = useServices();
  const prompt = state.prompt as NeighborsPrompt;
  const answered = state.choice !== null;
  const [draft, setDraft] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [lods, setLods] = useState<Partial<Record<Lod, Topology>>>({});
  const picks = answered ? (state.picks ?? []) : draft;
  const name = (id: string): string => world.byId.get(id)?.name ?? id;

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

  const entities = useMemo(
    () =>
      world.entities
        .filter((e) => e.type === "country")
        .map((e) => ({ id: e.id, name: e.name, labelPoint: e.ref })),
    [world],
  );
  const states = useMemo(() => {
    const out: Record<string, MapFeatureState> = {};
    const right = new Set(prompt.correct);
    for (const id of picks)
      out[id] = answered ? (right.has(id) ? "correct" : "wrong") : "highlight";
    if (answered) for (const id of prompt.correct) out[id] ??= "near";
    out[prompt.targetId] = "disputed";
    return out;
  }, [picks, answered, prompt]);

  const toggle = (id: string) => {
    if (answered || id === prompt.targetId) return;
    setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  };
  const suggestions =
    !answered && text.trim() !== "" ? suggest(world, text).filter((e) => e.type === "country") : [];
  const missed = prompt.correct.filter((id) => !picks.includes(id));
  const extra = picks.filter((id) => !prompt.correct.includes(id));

  return (
    <div className={styles.followUp}>
      <h3>{t("sil.followUpNeighbors", { name: name(prompt.targetId) })}</h3>
      <div className={styles.neighborMap}>
        <GameMap
          lods={lods}
          entities={entities}
          states={states}
          mode={answered ? "view" : "select"}
          onSelect={toggle}
          labels={LABELS}
          aria-label={t("sil.neighbors.map", { name: name(prompt.targetId) })}
        />
      </div>
      {!answered && (
        <>
          <AnswerInput
            label={t("sil.neighbors.add")}
            value={text}
            onChange={setText}
            onSubmit={(v) => {
              const hit = suggest(world, v)[0];
              if (hit) toggle(hit.id);
              setText("");
            }}
            status={null}
          />
          {suggestions.length > 0 && (
            <ul className={styles.suggestions} aria-label={t("sil.suggestions")}>
              {suggestions.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => {
                      toggle(e.id);
                      setText("");
                    }}
                  >
                    {e.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <p>
        {picks.length === 0
          ? t("sil.neighbors.none")
          : t("sil.neighbors.picked", { list: picks.map(name).join(", ") })}
      </p>
      {!answered && picks.length > 0 && (
        <ul className={styles.suggestions}>
          {picks.map((id) => (
            <li key={id}>
              <button type="button" onClick={() => toggle(id)}>
                {t("sil.neighbors.remove", { name: name(id) })}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!answered && (
        <Button variant="primary" isDisabled={picks.length === 0} onPress={() => onSubmit(draft)}>
          {t("sil.neighbors.submit")}
        </Button>
      )}
      {answered && (
        <div role="status">
          {state.choice === 1 ? (
            <p>
              {t("sil.neighbors.right", {
                n: prompt.correct.length,
                list: prompt.correct.map(name).join(", "),
              })}
            </p>
          ) : (
            <>
              <p>{t("sil.neighbors.wrong", { list: prompt.correct.map(name).join(", ") })}</p>
              {missed.length > 0 && (
                <p>{t("sil.neighbors.missed", { list: missed.map(name).join(", ") })}</p>
              )}
              {extra.length > 0 && (
                <p>{t("sil.neighbors.extra", { list: extra.map(name).join(", ") })}</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
