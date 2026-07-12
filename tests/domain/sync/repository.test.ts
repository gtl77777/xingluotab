import { describe, expect, it } from "vitest";
import { getSyncSetting, saveSyncSetting, SYNC_SETTING_STORAGE_KEY } from "../../../src/domain/sync/repository";
import { defaultSyncSetting, type SyncSetting } from "../../../src/domain/sync/schema";
import { createMemoryStorage, json } from "../../helpers/memoryStorage";

describe("sync setting repository", () => {
  it("returns defaults when storage is empty", async () => {
    await expect(getSyncSetting(createMemoryStorage())).resolves.toEqual(defaultSyncSetting);
  });

  it("merges stored partial sync settings with defaults", async () => {
    const storage = createMemoryStorage({
      [SYNC_SETTING_STORAGE_KEY]: json({
        enableWebDAVSync: true,
        webDAVUrl: "https://dav.example.test"
      })
    });

    await expect(getSyncSetting(storage)).resolves.toEqual({
      ...defaultSyncSetting,
      enableWebDAVSync: true,
      webDAVUrl: "https://dav.example.test"
    });
  });

  it("saves the complete sync setting object", async () => {
    const storage = createMemoryStorage();
    const setting: SyncSetting = {
      ...defaultSyncSetting,
      enableWebDAVSync: true,
      webDAVUrl: "https://dav.example.test",
      webDAVUsername: "user",
      webDAVPassword: "pass",
      autoSyncMode: "webdav"
    };

    await saveSyncSetting(setting, storage);

    expect(JSON.parse(storage.dump()[SYNC_SETTING_STORAGE_KEY] ?? "null")).toEqual(setting);
  });
});
