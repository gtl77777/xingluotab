import { useMemo, useSyncExternalStore } from "react";
import { languageStore } from "./languageStore";
import { translate, type TranslationKey, type TranslationValues } from "./messages";

export function useI18n(languageOverride?: string) {
  const storedLanguage = useSyncExternalStore(languageStore.subscribe, languageStore.getSnapshot, languageStore.getSnapshot);
  const language = languageOverride ?? storedLanguage;
  const t = useMemo(() => {
    return (key: TranslationKey, values?: TranslationValues) => translate(language, key, values);
  }, [language]);

  return { language, t };
}
