import { describe, expect, it, vi } from "vitest";
import { SPACE_VERSION_STORAGE_KEY } from "../../../src/domain/space/repository";
import { createSpaceVersionStore } from "../../../src/features/storage/spaceVersionStore";

function deferredTick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("space version store", () => {
  it("shares one listener set, publishes storage changes, and sends app_created once", async () => {
    let storedVersion = "1700000000000";
    const storageListeners = new Set<(changes: Record<string, chrome.storage.StorageChange>, area: string) => void>();
    const runtimeListeners = new Set<(message: unknown) => void>();
    const sendRuntimeMessage = vi.fn(async () => undefined);
    const store = createSpaceVersionStore({
      readVersion: async () => storedVersion,
      addStorageChangeListener(listener) {
        storageListeners.add(listener);
        return () => storageListeners.delete(listener);
      },
      addRuntimeMessageListener(listener) {
        runtimeListeners.add(listener);
        return () => runtimeListeners.delete(listener);
      },
      sendRuntimeMessage
    });
    const firstSubscriber = vi.fn();
    const secondSubscriber = vi.fn();

    const unsubscribeFirst = store.subscribe(firstSubscriber);
    const unsubscribeSecond = store.subscribe(secondSubscriber);
    await deferredTick();

    expect(storageListeners.size).toBe(1);
    expect(runtimeListeners.size).toBe(1);
    expect(sendRuntimeMessage).toHaveBeenCalledTimes(1);
    expect(sendRuntimeMessage).toHaveBeenCalledWith({ event: "app_created" });
    expect(store.getSnapshot()).toEqual({ version: 1700000000000, revision: 1 });

    for (const listener of storageListeners) {
      listener({ [SPACE_VERSION_STORAGE_KEY]: { newValue: "1800000000000" } }, "local");
    }

    expect(store.getSnapshot()).toEqual({ version: 1800000000000, revision: 2 });
    expect(firstSubscriber).toHaveBeenCalledTimes(2);
    expect(secondSubscriber).toHaveBeenCalledTimes(2);

    unsubscribeFirst();
    unsubscribeSecond();
    expect(storageListeners.size).toBe(0);
    expect(runtimeListeners.size).toBe(0);

    const unsubscribeAgain = store.subscribe(vi.fn());
    await deferredTick();
    expect(sendRuntimeMessage).toHaveBeenCalledTimes(1);
    unsubscribeAgain();
  });

  it("forces a revision refresh after data_pull_done even when the version is unchanged", async () => {
    let storedVersion = "1700000000000";
    const runtimeListeners = new Set<(message: unknown) => void>();
    const store = createSpaceVersionStore({
      readVersion: async () => storedVersion,
      addStorageChangeListener: () => () => undefined,
      addRuntimeMessageListener(listener) {
        runtimeListeners.add(listener);
        return () => runtimeListeners.delete(listener);
      },
      sendRuntimeMessage: async () => undefined
    });

    const unsubscribe = store.subscribe(() => undefined);
    await deferredTick();
    const firstSnapshot = store.getSnapshot();

    storedVersion = "1700000000000";
    for (const listener of runtimeListeners) listener({ event: "data_pull_done" });
    await deferredTick();

    expect(store.getSnapshot()).toEqual({ version: firstSnapshot.version, revision: firstSnapshot.revision + 1 });
    unsubscribe();
  });
});
