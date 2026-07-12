import { describe, expect, it } from "vitest";
import { languageOptions, normalizeLanguage, translate } from "../../../src/features/i18n/messages";

describe("i18n messages", () => {
  it("translates core shell labels for Simplified Chinese", () => {
    expect(translate("zh-CN", "brand.name")).toBe("星罗Tab");
    expect(translate("zh-CN", "settings.title")).toBe("设置");
    expect(translate("zh-CN", "sync.title")).toBe("备份与同步");
    expect(translate("zh-CN", "search.placeholder")).toBe("搜索标签页");
  });

  it("uses the localized product brand", () => {
    expect(translate("en", "brand.name")).toBe("XingLuoTab");
    expect(translate("zh-CN", "brand.name")).toBe("星罗Tab");
    expect(translate("zh-TW", "brand.name")).toBe("星羅Tab");
  });

  it("normalizes Chinese variants", () => {
    expect(normalizeLanguage("zh-HK")).toBe("zh-TW");
    expect(normalizeLanguage("zh")).toBe("zh-CN");
  });

  it("falls back to English and replaces placeholders", () => {
    expect(translate("nl", "settings.title")).toBe("Settings");
    expect(translate("zh-CN", "sync.exportedSpaces", { count: 2 })).toBe("已导出 2 个空间");
  });

  it("has core shell translations for every 1.0 language option", () => {
    for (const option of languageOptions) {
      expect(translate(option.value, "settings.title")).toBeTruthy();
      expect(translate(option.value, "sync.title")).toBeTruthy();
      expect(translate(option.value, "search.placeholder")).toBeTruthy();

      if (option.value === "en") continue;
      expect(translate(option.value, "settings.title")).not.toBe(translate("en", "settings.title"));
      expect(translate(option.value, "search.placeholder")).not.toBe(translate("en", "search.placeholder"));
    }
  });

  it("translates About, Space dialogs, card menus, and Current tabs for every 1.0 language", () => {
    const expandedKeys = [
      "about.description",
      "about.usageScaleTitle",
      "about.usageScaleComfort",
      "about.usageScaleLarge",
      "space.renameGroup",
      "space.emptyGroup",
      "space.deleteTab",
      "space.exported",
      "session.closeTab",
      "sync.operationFailed",
      "sync.syncing",
      "sync.nogithubToken",
      "sync.miss_webdav_credentials",
      "common.delete",
      "space.tagFilter",
      "space.exitZen",
      "space.view.compact",
      "space.collectionStats",
      "settings.colorMode",
      "settings.logo.remove",
      "settings.zenTheme"
    ] as const;

    for (const option of languageOptions) {
      for (const key of expandedKeys) {
        expect(translate(option.value, key)).toBeTruthy();
        if (option.value !== "en") {
          expect(translate(option.value, key)).not.toBe(translate("en", key));
        }
      }
    }
  });

  it("replaces placeholders in expanded Space and Current tabs messages", () => {
    expect(translate("zh-CN", "session.savedTabs", { count: 3 })).toBe("已保存 3 个标签页");
    expect(translate("zh-CN", "space.collectionStats", { groups: 12, tabs: 345 })).toBe("12 个分组 · 345 个元素");
    expect(translate("de", "session.savedTabs", { count: 3 })).toBe("3 Tabs gespeichert");
  });
});
