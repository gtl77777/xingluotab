import { describe, expect, it } from "vitest";
import { applyDocumentTheme, resolveTheme, watchDocumentAppearance, watchDocumentTheme } from "../../../src/features/settings/theme";

describe("settings theme", () => {
  it("resolves explicit and system themes", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme(undefined, false)).toBe("light");
  });

  it("applies the resolved theme class to the root element", () => {
    const classes = new Set(["dark"]);
    const root = {
      classList: {
        add(value: string) {
          classes.add(value);
        },
        remove(...values: string[]) {
          for (const value of values) classes.delete(value);
        }
      }
    } as unknown as HTMLElement;

    expect(applyDocumentTheme("light", root, true)).toBe("light");
    expect([...classes]).toEqual(["light"]);
  });

  it("follows system theme changes and removes the listener", () => {
    const classes = new Set<string>();
    const root = {
      classList: {
        add(value: string) {
          classes.add(value);
        },
        remove(...values: string[]) {
          for (const value of values) classes.delete(value);
        }
      }
    } as unknown as HTMLElement;
    let listener: ((event: { matches: boolean }) => void) | undefined;
    const mediaQuery = {
      matches: false,
      addEventListener(_type: "change", nextListener: (event: { matches: boolean }) => void) {
        listener = nextListener;
      },
      removeEventListener(_type: "change", nextListener: (event: { matches: boolean }) => void) {
        if (listener === nextListener) listener = undefined;
      }
    };

    const stop = watchDocumentTheme("system", root, () => mediaQuery);
    expect([...classes]).toEqual(["light"]);

    listener?.({ matches: true });
    expect([...classes]).toEqual(["dark"]);

    stop();
    expect(listener).toBeUndefined();
  });

  it("switches the visual theme together with system color mode", () => {
    const classes = new Set<string>();
    const root = {
      dataset: {},
      classList: {
        add(value: string) {
          classes.add(value);
        },
        remove(...values: string[]) {
          for (const value of values) classes.delete(value);
        }
      }
    } as unknown as HTMLElement;
    let listener: ((event: { matches: boolean }) => void) | undefined;
    const mediaQuery = {
      matches: false,
      addEventListener(_type: "change", nextListener: (event: { matches: boolean }) => void) {
        listener = nextListener;
      },
      removeEventListener(_type: "change", nextListener: (event: { matches: boolean }) => void) {
        if (listener === nextListener) listener = undefined;
      }
    };

    const stop = watchDocumentAppearance("system", "paper", "oled", root, () => mediaQuery);
    expect([...classes]).toEqual(["light"]);
    expect(root.dataset.visualTheme).toBe("paper");

    listener?.({ matches: true });
    expect([...classes]).toEqual(["dark"]);
    expect(root.dataset.visualTheme).toBe("oled");

    stop();
    expect(listener).toBeUndefined();
  });
});
