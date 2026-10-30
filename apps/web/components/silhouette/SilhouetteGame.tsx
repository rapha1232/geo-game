"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@meridian/ui";
import { t } from "../../lib/i18n";
import { useServices } from "../shell/StorageProvider";
import { assemble, loadSilhouettePacks, type Loaded } from "../../lib/silhouette/data";
import { newSession, type Session } from "../../lib/silhouette/controller";
import { SilhouetteView } from "./SilhouetteView";
import styles from "./silhouette.module.css";

export const GAME_ID = "silhouette";

const newSeed = (): string => {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => "0123456789ABCDEFGHJKMNPQRSTVWXYZ"[b % 32]).join("");
};

/** Loads the packs, restores an unfinished session if there is one, and saves after every action (AC-SH-016). */
export function SilhouetteGame() {
  const services = useServices();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    if (!services) return;
    let live = true;
    setError(false);
    void (async () => {
      try {
        const data = assemble(await loadSilhouettePacks(services.loader));
        const manifest = await services.loader.manifest();
        const saved = await services.store.find(GAME_ID);
        if (!live) return;
        seq.current = saved?.seq ?? 0;
        const restored =
          saved && saved.content_version === manifest.current ? (saved.state as Session) : null;
        setLoaded(data);
        setSession(restored ?? newSession(data.world, newSeed()));
      } catch {
        if (live) setError(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [services, attempt]);

  const update = useCallback(
    (next: Session) => {
      setSession(next);
      void services?.loader.manifest().then((m) => {
        services.store.save({
          game_id: GAME_ID,
          seq: ++seq.current,
          updated_at: Date.now(),
          content_version: m.current,
          title: t("sil.title"),
          progress: t("sil.round", { n: next.roundNo }),
          href: "/play/silhouette",
          state: next,
        });
      });
    },
    [services],
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
    <SilhouetteView
      session={session}
      world={loaded.world}
      shapes={loaded.shapes}
      onChange={update}
    />
  );
}
