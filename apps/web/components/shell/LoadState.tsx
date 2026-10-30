"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@meridian/ui";
import { t } from "../../lib/i18n";
import { useServices } from "./StorageProvider";

/** Shows nothing for the first 300 ms, so a fast load never flashes a spinner (UX_AND_DESIGN §8). */
export function LoadingState({
  children,
  className,
}: {
  children: ReactNode;
  className?: string | undefined;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setShown(true), 300);
    return () => clearTimeout(id);
  }, []);
  return (
    <div role="status" className={className}>
      {shown ? children : null}
    </div>
  );
}

/**
 * A pack failed to load. Offline, the page says the game is available when the connection is back and retries by
 * itself when it returns; online, it offers Retry (AC-PL-014).
 */
export function LoadFailure({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry: () => void;
  className?: string | undefined;
}) {
  const services = useServices();
  const online = services?.online ?? true;
  const wasOffline = useRef(!online);
  useEffect(() => {
    if (online && wasOffline.current) onRetry();
    wasOffline.current = !online;
  }, [online, onRetry]);
  return (
    <div role="alert" className={className}>
      <p>{online ? message : t("state.offlineUncached")}</p>
      {online && <Button onPress={onRetry}>{t("sil.retry")}</Button>}
    </div>
  );
}
