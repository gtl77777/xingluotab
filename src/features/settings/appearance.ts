import type { UserSetting } from "../../domain/settings/schema";

export type AccentTheme = NonNullable<UserSetting["accentTheme"]>;
export type LightVisualTheme = NonNullable<UserSetting["lightVisualTheme"]>;
export type DarkVisualTheme = NonNullable<UserSetting["darkVisualTheme"]>;
export type VisualTheme = LightVisualTheme | DarkVisualTheme;
export type ZenTheme = NonNullable<UserSetting["zenTheme"]>;
export type CollectionView = NonNullable<UserSetting["collectionView"]>;
export type CollectionSort = NonNullable<UserSetting["collectionSort"]>;

export const ACCENT_THEMES: AccentTheme[] = [
  "pink",
  "blue",
  "purple",
  "brown",
  "green",
  "summer",
  "autumn",
  "winter",
  "spring"
];

export const ZEN_THEMES: ZenTheme[] = ["minimal", "ghibli", "glass"];
export const LIGHT_VISUAL_THEMES: LightVisualTheme[] = ["professional", "mica", "aurora", "paper"];
export const DARK_VISUAL_THEMES: DarkVisualTheme[] = ["professional", "mica", "aurora", "oled"];
export const COLLECTION_VIEWS: CollectionView[] = ["card", "list", "compact", "grid"];
export const COLLECTION_SORTS: CollectionSort[] = ["manual", "alphabetical", "starred", "created"];

export const MAX_LOGO_FILE_SIZE = 2 * 1024 * 1024;

export function isAccentTheme(value: unknown): value is AccentTheme {
  return typeof value === "string" && ACCENT_THEMES.includes(value as AccentTheme);
}

export function isZenTheme(value: unknown): value is ZenTheme {
  return typeof value === "string" && ZEN_THEMES.includes(value as ZenTheme);
}

export function isLightVisualTheme(value: unknown): value is LightVisualTheme {
  return typeof value === "string" && LIGHT_VISUAL_THEMES.includes(value as LightVisualTheme);
}

export function isDarkVisualTheme(value: unknown): value is DarkVisualTheme {
  return typeof value === "string" && DARK_VISUAL_THEMES.includes(value as DarkVisualTheme);
}

export function isCollectionView(value: unknown): value is CollectionView {
  return typeof value === "string" && COLLECTION_VIEWS.includes(value as CollectionView);
}

export function isCollectionSort(value: unknown): value is CollectionSort {
  return typeof value === "string" && COLLECTION_SORTS.includes(value as CollectionSort);
}

export function applyAccentTheme(theme: AccentTheme | undefined, root: HTMLElement = document.documentElement) {
  const resolved = isAccentTheme(theme) ? theme : "pink";
  root.dataset.accentTheme = resolved;
  return resolved;
}

export function resolveVisualTheme(
  mode: "light" | "dark",
  lightTheme: LightVisualTheme | undefined,
  darkTheme: DarkVisualTheme | undefined
): VisualTheme {
  if (mode === "dark") return isDarkVisualTheme(darkTheme) ? darkTheme : "professional";
  return isLightVisualTheme(lightTheme) ? lightTheme : "professional";
}

export function applyVisualTheme(
  mode: "light" | "dark",
  lightTheme: LightVisualTheme | undefined,
  darkTheme: DarkVisualTheme | undefined,
  root: HTMLElement = document.documentElement
) {
  const resolved = resolveVisualTheme(mode, lightTheme, darkTheme);
  root.dataset.visualTheme = resolved;
  return resolved;
}

export function validateLogoFile(file: Pick<File, "size" | "type">) {
  if (!['image/png', 'image/jpeg'].includes(file.type)) return "type" as const;
  if (file.size > MAX_LOGO_FILE_SIZE) return "size" as const;
  return null;
}

export async function createLogoDataUrl(file: File, size = 128) {
  const issue = validateLogoFile(file);
  if (issue) throw new Error(`logo.${issue}`);

  const source = await readFileAsDataUrl(file);
  const image = await loadImage(source);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("logo.canvas");

  const cropSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = (image.naturalWidth - cropSize) / 2;
  const sourceY = (image.naturalHeight - cropSize) / 2;
  context.drawImage(image, sourceX, sourceY, cropSize, cropSize, 0, 0, size, size);
  return canvas.toDataURL("image/png", 0.92);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("logo.read"));
    reader.onerror = () => reject(reader.error ?? new Error("logo.read"));
    reader.readAsDataURL(file);
  });
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("logo.image"));
    image.src = source;
  });
}
