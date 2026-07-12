import { describe, expect, it } from "vitest";
import {
  applyAccentTheme,
  applyVisualTheme,
  isAccentTheme,
  isCollectionSort,
  isCollectionView,
  isDarkVisualTheme,
  isLightVisualTheme,
  isZenTheme,
  MAX_LOGO_FILE_SIZE,
  validateLogoFile
} from "../../../src/features/settings/appearance";

describe("settings appearance", () => {
  it("recognizes supported appearance values", () => {
    expect(isAccentTheme("winter")).toBe(true);
    expect(isAccentTheme("rainbow")).toBe(false);
    expect(isZenTheme("ghibli")).toBe(true);
    expect(isZenTheme("pink")).toBe(false);
    expect(isLightVisualTheme("paper")).toBe(true);
    expect(isLightVisualTheme("oled")).toBe(false);
    expect(isDarkVisualTheme("oled")).toBe(true);
    expect(isDarkVisualTheme("paper")).toBe(false);
    expect(isCollectionView("compact")).toBe(true);
    expect(isCollectionView("columns")).toBe(false);
    expect(isCollectionSort("alphabetical")).toBe(true);
    expect(isCollectionSort("recent")).toBe(false);
  });

  it("applies the visual theme for the resolved color mode with safe fallbacks", () => {
    const root = { dataset: {} } as unknown as HTMLElement;
    expect(applyVisualTheme("light", "paper", "oled", root)).toBe("paper");
    expect(root.dataset.visualTheme).toBe("paper");
    expect(applyVisualTheme("dark", "paper", "oled", root)).toBe("oled");
    expect(root.dataset.visualTheme).toBe("oled");
    expect(applyVisualTheme("dark", undefined, undefined, root)).toBe("professional");
  });

  it("applies an accent theme with a safe fallback", () => {
    const root = { dataset: {} } as unknown as HTMLElement;
    expect(applyAccentTheme("blue", root)).toBe("blue");
    expect(root.dataset.accentTheme).toBe("blue");
    expect(applyAccentTheme(undefined, root)).toBe("pink");
  });

  it("validates local logo type and size", () => {
    expect(validateLogoFile({ type: "image/png", size: MAX_LOGO_FILE_SIZE })).toBeNull();
    expect(validateLogoFile({ type: "image/webp", size: 1 })).toBe("type");
    expect(validateLogoFile({ type: "image/jpeg", size: MAX_LOGO_FILE_SIZE + 1 })).toBe("size");
  });
});
