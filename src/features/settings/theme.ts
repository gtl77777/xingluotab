import type { UserSetting } from "../../domain/settings/schema";
import { applyVisualTheme, type DarkVisualTheme, type LightVisualTheme } from "./appearance";
export { applyAccentTheme } from "./appearance";

export type ThemeMode = NonNullable<UserSetting["theme"]>;

export function resolveTheme(theme: ThemeMode | undefined, prefersDark: boolean) {
  if (theme === "light" || theme === "dark") return theme;
  return prefersDark ? "dark" : "light";
}

export function applyDocumentTheme(
  theme: ThemeMode | undefined,
  root: HTMLElement = document.documentElement,
  prefersDark = globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false
) {
  const resolved = resolveTheme(theme, prefersDark);
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  return resolved;
}

type MediaQueryListLike = {
  matches: boolean;
  addEventListener?: (type: "change", listener: (event: { matches: boolean }) => void) => void;
  removeEventListener?: (type: "change", listener: (event: { matches: boolean }) => void) => void;
  addListener?: (listener: (event: { matches: boolean }) => void) => void;
  removeListener?: (listener: (event: { matches: boolean }) => void) => void;
};

export function watchDocumentTheme(
  theme: ThemeMode | undefined,
  root: HTMLElement = document.documentElement,
  getMediaQuery: () => MediaQueryListLike | undefined = () => globalThis.matchMedia?.("(prefers-color-scheme: dark)")
) {
  const mediaQuery = getMediaQuery();
  applyDocumentTheme(theme, root, mediaQuery?.matches ?? false);
  if (theme !== "system" || !mediaQuery) return () => undefined;

  const listener = (event: { matches: boolean }) => {
    applyDocumentTheme("system", root, event.matches);
  };
  if (mediaQuery.addEventListener) mediaQuery.addEventListener("change", listener);
  else mediaQuery.addListener?.(listener);

  return () => {
    if (mediaQuery.removeEventListener) mediaQuery.removeEventListener("change", listener);
    else mediaQuery.removeListener?.(listener);
  };
}

export function watchDocumentAppearance(
  theme: ThemeMode | undefined,
  lightVisualTheme: LightVisualTheme | undefined,
  darkVisualTheme: DarkVisualTheme | undefined,
  root: HTMLElement = document.documentElement,
  getMediaQuery: () => MediaQueryListLike | undefined = () => globalThis.matchMedia?.("(prefers-color-scheme: dark)")
) {
  const mediaQuery = getMediaQuery();
  const apply = (prefersDark: boolean) => {
    const resolvedMode = applyDocumentTheme(theme, root, prefersDark);
    applyVisualTheme(resolvedMode, lightVisualTheme, darkVisualTheme, root);
  };
  apply(mediaQuery?.matches ?? false);
  if (theme !== "system" || !mediaQuery) return () => undefined;

  const listener = (event: { matches: boolean }) => apply(event.matches);
  if (mediaQuery.addEventListener) mediaQuery.addEventListener("change", listener);
  else mediaQuery.addListener?.(listener);

  return () => {
    if (mediaQuery.removeEventListener) mediaQuery.removeEventListener("change", listener);
    else mediaQuery.removeListener?.(listener);
  };
}
