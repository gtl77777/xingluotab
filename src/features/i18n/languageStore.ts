import { getUserSetting, USER_SETTING_STORAGE_KEY } from "../../domain/settings/repository";
import { defaultUserSetting } from "../../domain/settings/schema";

export type LanguageStoreDependencies = {
  loadLanguage(): Promise<string>;
  subscribeToStorage(listener: (language: string) => void): () => void;
};

export function createLanguageStore(dependencies: LanguageStoreDependencies) {
  let language = defaultUserSetting.language;
  let storageRevision = 0;
  let lifecycle = 0;
  let unsubscribeStorage: (() => void) | undefined;
  const subscribers = new Set<() => void>();

  const update = (nextLanguage: string) => {
    if (nextLanguage === language) return;
    language = nextLanguage;
    subscribers.forEach((subscriber) => subscriber());
  };

  const start = () => {
    const currentLifecycle = ++lifecycle;
    const initialRevision = storageRevision;
    void dependencies.loadLanguage().then(
      (storedLanguage) => {
        if (currentLifecycle === lifecycle && initialRevision === storageRevision) update(storedLanguage);
      },
      () => {
        if (currentLifecycle === lifecycle && initialRevision === storageRevision) update(defaultUserSetting.language);
      }
    );
    unsubscribeStorage = dependencies.subscribeToStorage((storedLanguage) => {
      storageRevision += 1;
      update(storedLanguage);
    });
  };

  return {
    getSnapshot: () => language,
    subscribe(subscriber: () => void) {
      subscribers.add(subscriber);
      if (subscribers.size === 1) start();
      return () => {
        subscribers.delete(subscriber);
        if (subscribers.size > 0) return;
        lifecycle += 1;
        unsubscribeStorage?.();
        unsubscribeStorage = undefined;
      };
    }
  };
}

function parseStoredLanguage(value: unknown) {
  try {
    const setting = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
    if (typeof setting === "object" && setting !== null && "language" in setting) {
      const language = (setting as { language?: unknown }).language;
      if (typeof language === "string") return language;
    }
  } catch {
    // Invalid settings fall back to the default language.
  }
  return defaultUserSetting.language;
}

export const languageStore = createLanguageStore({
  async loadLanguage() {
    return (await getUserSetting()).language;
  },
  subscribeToStorage(onLanguage) {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== "local" || !changes[USER_SETTING_STORAGE_KEY]) return;
      onLanguage(parseStoredLanguage(changes[USER_SETTING_STORAGE_KEY].newValue));
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }
});
