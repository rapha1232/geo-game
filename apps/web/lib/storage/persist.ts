/**
 * Asks the browser to keep Meridian's storage when it runs short of space (OPEN_QUESTIONS R-13). Without it, Safari and
 * others may evict IndexedDB and a guest loses every result. Called after the first saved result, not on page load:
 * Firefox shows a prompt for it, and there is nothing worth keeping before then. Never throws.
 */
export async function requestPersistence(
  storage: Pick<StorageManager, "persist" | "persisted"> | undefined = globalThis.navigator
    ?.storage,
): Promise<boolean> {
  try {
    if (!storage?.persist || !storage.persisted) return false;
    if (await storage.persisted()) return true;
    return await storage.persist();
  } catch {
    return false;
  }
}
