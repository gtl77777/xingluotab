import { describe, expect, it } from "vitest";
import {
  getUserSetting,
  saveLastVisitedSpaceId,
  saveUserSetting,
  USER_SETTING_STORAGE_KEY
} from "../../../src/domain/settings/repository";
import { defaultUserSetting, type UserSetting } from "../../../src/domain/settings/schema";
import { createMemoryStorage, json } from "../../helpers/memoryStorage";

describe("user setting repository", () => {
  it("returns defaults when storage is empty", async () => {
    await expect(getUserSetting(createMemoryStorage())).resolves.toEqual(defaultUserSetting);
  });

  it("merges stored partial settings with defaults", async () => {
    const storage = createMemoryStorage({
      [USER_SETTING_STORAGE_KEY]: json({
        newtab: "none",
        openTabMode: "replace"
      })
    });

    await expect(getUserSetting(storage)).resolves.toEqual({
      ...defaultUserSetting,
      newtab: "none",
      openTabMode: "replace",
      collapsedGroups: []
    });
  });

  it("saves the complete user setting object", async () => {
    const storage = createMemoryStorage();
    const setting: UserSetting = {
      ...defaultUserSetting,
      newtab: "none",
      openGroupMode: "group",
      theme: "dark"
    };

    await saveUserSetting(setting, storage);

    expect(JSON.parse(storage.dump()[USER_SETTING_STORAGE_KEY] ?? "null")).toEqual(setting);
  });

  it("remembers the last visited space without dropping other settings", async () => {
    const storage = createMemoryStorage({
      [USER_SETTING_STORAGE_KEY]: json({
        ...defaultUserSetting,
        theme: "dark",
        openGroupMode: "group"
      })
    });

    await expect(saveLastVisitedSpaceId("space-a", storage)).resolves.toMatchObject({
      lastVisitedSpaceId: "space-a",
      theme: "dark",
      openGroupMode: "group"
    });

    expect(JSON.parse(storage.dump()[USER_SETTING_STORAGE_KEY] ?? "null")).toMatchObject({
      lastVisitedSpaceId: "space-a",
      theme: "dark",
      openGroupMode: "group"
    });
  });
});
