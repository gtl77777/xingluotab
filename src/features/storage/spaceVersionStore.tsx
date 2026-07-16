import { useContext, useSyncExternalStore, createContext, type ReactNode } from "react";
import { SPACE_VERSION_STORAGE_KEY } from "../../domain/space/repository";
import { getLocalString } from "../../platform/storage";

export type SpaceVersionSnapshot = {
  version: number;
  revision: number;
};

type StorageChangeListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string
) => void;
type RuntimeMessageListener = (message: unknown) => void;

type SpaceVersionStoreDependencies = {
  readVersion: () => Promise<string>;
  addStorageChangeListener: (listener: StorageChangeListener) => () => void;
  addRuntimeMessageListener: (listener: RuntimeMessageListener) => () => void;
  sendRuntimeMessage: (message: { event: "app_created" }) => Promise<unknown>;
};

export type SpaceVersionStore = {
  getSnapshot: () => SpaceVersionSnapshot;
  subscribe: (listener: () => void) => () => void;
  refresh: () => Promise<void>;
};

function parseVersion(value: unknown) {
  const version = Number(value);
  return Number.isFinite(version) && version > 0 ? version : 0;
}

export function createSpaceVersionStore(dependencies: SpaceVersionStoreDependencies): SpaceVersionStore {
  let snapshot: SpaceVersionSnapshot = { version: 0, revision: 0 };
  let refreshSequence = 0;
  let appCreatedSent = false;
  let stopListening: (() => void) | null = null;
  const subscribers = new Set<() => void>();

  function publish(version: number) {
    snapshot = { version, revision: snapshot.revision + 1 };
    for (const subscriber of subscribers) subscriber();
  }

  async function refresh() {
    const sequence = ++refreshSequence;
    try {
      const version = parseVersion(await dependencies.readVersion());
      if (sequence === refreshSequence) publish(version);
    } catch {
      if (sequence === refreshSequence) publish(snapshot.version);
    }
  }

  function startListening() {
    if (stopListening) return;

    const removeStorageListener = dependencies.addStorageChangeListener((changes, areaName) => {
      if (areaName !== "local" || !changes[SPACE_VERSION_STORAGE_KEY]) return;
      refreshSequence += 1;
      publish(parseVersion(changes[SPACE_VERSION_STORAGE_KEY]?.newValue));
    });
    const removeRuntimeListener = dependencies.addRuntimeMessageListener((message) => {
      if ((message as { event?: string } | null)?.event === "data_pull_done") {
        void refresh();
      }
    });

    stopListening = () => {
      removeStorageListener();
      removeRuntimeListener();
      stopListening = null;
    };

    if (!appCreatedSent) {
      appCreatedSent = true;
      void dependencies.sendRuntimeMessage({ event: "app_created" }).catch(() => {
        // The options page remains usable if the MV3 worker is unavailable during startup.
      });
    }

    void refresh();
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      subscribers.add(listener);
      startListening();
      return () => {
        subscribers.delete(listener);
        if (subscribers.size === 0) stopListening?.();
      };
    },
    refresh
  };
}

const defaultSpaceVersionStore = createSpaceVersionStore({
  readVersion: () => getLocalString(SPACE_VERSION_STORAGE_KEY),
  addStorageChangeListener(listener) {
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  },
  addRuntimeMessageListener(listener) {
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  },
  sendRuntimeMessage: (message) => chrome.runtime.sendMessage(message)
});

type SpaceVersionContextValue = SpaceVersionSnapshot & {
  refresh: () => Promise<void>;
};

const SpaceVersionContext = createContext<SpaceVersionContextValue | null>(null);

export function SpaceVersionProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(
    defaultSpaceVersionStore.subscribe,
    defaultSpaceVersionStore.getSnapshot,
    defaultSpaceVersionStore.getSnapshot
  );
  return (
    <SpaceVersionContext.Provider value={{ ...snapshot, refresh: defaultSpaceVersionStore.refresh }}>
      {children}
    </SpaceVersionContext.Provider>
  );
}

export function useSpaceVersion() {
  const snapshot = useContext(SpaceVersionContext);
  if (!snapshot) throw new Error("useSpaceVersion must be used within SpaceVersionProvider");
  return snapshot;
}
