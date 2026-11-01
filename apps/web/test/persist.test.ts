import { describe, expect, it, vi } from "vitest";
import { requestPersistence } from "../lib/storage/persist";

describe("persistent storage request (R-13)", () => {
  it("asks once storage is not yet persisted, and reports the answer", async () => {
    const persist = vi.fn(async () => true);
    expect(await requestPersistence({ persisted: async () => false, persist })).toBe(true);
    expect(persist).toHaveBeenCalledOnce();
  });
  it("does not ask again when storage is already persisted", async () => {
    const persist = vi.fn(async () => true);
    expect(await requestPersistence({ persisted: async () => true, persist })).toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });
  it("never throws: no API, or a failing one, answers false", async () => {
    expect(await requestPersistence(undefined)).toBe(false);
    expect(
      await requestPersistence({
        persisted: async () => false,
        persist: async () => Promise.reject(new Error("denied")),
      }),
    ).toBe(false);
  });
});
