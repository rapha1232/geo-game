"use client";

import { useEffect, useMemo, useState } from "react";
import { gameResult, type GameResult } from "@meridian/schemas";
import type { QuizWorld } from "@meridian/quiz";
import { buildCatalog } from "../../lib/catalog/catalog";
import { playedFrom, readFavorites, setFavorite } from "../../lib/catalog/store";
import { assembleQuiz, loadQuizPacks } from "../../lib/quiz/data";
import { useServices } from "../shell/StorageProvider";
import { CatalogView } from "./CatalogView";

/** Loads favorites, play history and (for entity search) the content, then shows the catalog. */
export function CatalogPage() {
  const services = useServices();
  const [world, setWorld] = useState<QuizWorld | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<GameResult[]>([]);

  useEffect(() => {
    if (!services) return;
    let live = true;
    void (async () => {
      const favs = await readFavorites(services.db);
      const rows = await services.db.results.toArray().catch(() => []);
      if (!live) return;
      setFavorites(favs);
      setResults(
        rows.flatMap((r) => {
          const p = gameResult.safeParse(r.data);
          return p.success ? [p.data] : [];
        }),
      );
      try {
        const { packs, edges } = await loadQuizPacks(services.loader);
        if (live) setWorld(assembleQuiz(packs, edges).world);
      } catch {
        /* the catalog still works by title; entity search needs the content */
      }
    })();
    return () => {
      live = false;
    };
  }, [services]);

  const items = useMemo(() => buildCatalog(world), [world]);
  const played = useMemo(() => playedFrom(results), [results]);
  return (
    <CatalogView
      items={items}
      state={{ favorites, played }}
      onToggleFavorite={(key, on) => {
        setFavorites((cur) => {
          const next = new Set(cur);
          if (on) next.add(key);
          else next.delete(key);
          return next;
        });
        if (services) void setFavorite(services.db, key, on);
      }}
    />
  );
}
