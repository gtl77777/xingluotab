import { de } from "./locales/de";
import { en, type LocaleMessages, type TranslationKey } from "./locales/en";
import { es } from "./locales/es";
import { fr } from "./locales/fr";
import { it } from "./locales/it";
import { ja } from "./locales/ja";
import { ko } from "./locales/ko";
import { pt } from "./locales/pt";
import { ru } from "./locales/ru";
import { zhCN } from "./locales/zh-CN";
import { zhTW } from "./locales/zh-TW";

export const languageOptions = [
  { value: "en", labelKey: "language.en" },
  { value: "zh-CN", labelKey: "language.zhCN" },
  { value: "zh-TW", labelKey: "language.zhTW" },
  { value: "ja", labelKey: "language.ja" },
  { value: "ko", labelKey: "language.ko" },
  { value: "de", labelKey: "language.de" },
  { value: "es", labelKey: "language.es" },
  { value: "fr", labelKey: "language.fr" },
  { value: "it", labelKey: "language.it" },
  { value: "pt", labelKey: "language.pt" },
  { value: "ru", labelKey: "language.ru" }
] as const;

const dictionaries = {
  en,
  "zh-CN": { ...en, ...zhCN },
  "zh-TW": { ...en, ...zhTW },
  ko: { ...en, ...ko },
  ja: { ...en, ...ja },
  es: { ...en, ...es },
  pt: { ...en, ...pt },
  de: { ...en, ...de },
  fr: { ...en, ...fr },
  it: { ...en, ...it },
  ru: { ...en, ...ru }
} satisfies Record<string, LocaleMessages>;

export type { TranslationKey };
export type TranslationValues = Record<string, string | number | undefined>;

export function normalizeLanguage(language?: string) {
  if (!language) return "en";
  if (language in dictionaries) return language as keyof typeof dictionaries;
  if (language.toLowerCase().startsWith("zh-tw") || language.toLowerCase().startsWith("zh-hk")) return "zh-TW";
  if (language.toLowerCase().startsWith("zh")) return "zh-CN";
  return "en";
}

export function translate(language: string | undefined, key: TranslationKey, values: TranslationValues = {}) {
  const normalizedLanguage = normalizeLanguage(language);
  const template = dictionaries[normalizedLanguage][key] ?? en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ""));
}
