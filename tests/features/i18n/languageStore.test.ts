import { describe, expect, it, vi } from "vitest";
import { createLanguageStore } from "../../../src/features/i18n/languageStore";

describe("language store", () => {
  it("shares one storage listener across all subscribers and cleans it up", async () => {
    let storageListener: ((language: string) => void) | undefined;
    const unsubscribeStorage = vi.fn();
    const dependencies = {
      loadLanguage: vi.fn(async () => "zh-CN"),
      subscribeToStorage: vi.fn((listener: (language: string) => void) => {
        storageListener = listener;
        return unsubscribeStorage;
      })
    };
    const store = createLanguageStore(dependencies);
    const first = vi.fn();
    const second = vi.fn();

    const unsubscribeFirst = store.subscribe(first);
    const unsubscribeSecond = store.subscribe(second);
    await Promise.resolve();

    expect(dependencies.loadLanguage).toHaveBeenCalledTimes(1);
    expect(dependencies.subscribeToStorage).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toBe("zh-CN");
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    storageListener?.("ja");
    expect(store.getSnapshot()).toBe("ja");
    expect(first).toHaveBeenCalledTimes(2);
    expect(second).toHaveBeenCalledTimes(2);

    unsubscribeFirst();
    expect(unsubscribeStorage).not.toHaveBeenCalled();
    unsubscribeSecond();
    expect(unsubscribeStorage).toHaveBeenCalledTimes(1);
  });
});
