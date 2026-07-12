import { extensionLocalStorage, getLocalJson, setLocalJson, type LocalStoragePort } from "../../platform/storage";
import { defaultSyncSetting, type SyncSetting } from "./schema";

export const SYNC_SETTING_STORAGE_KEY = "xingluotab:sync-setting";

export async function getSyncSetting(localStorage = extensionLocalStorage): Promise<SyncSetting> {
  const stored = await getLocalJson<Partial<SyncSetting>>(SYNC_SETTING_STORAGE_KEY, {}, localStorage);
  return {
    ...defaultSyncSetting,
    ...stored
  };
}

export async function saveSyncSetting(setting: SyncSetting, localStorage: LocalStoragePort = extensionLocalStorage) {
  await setLocalJson(SYNC_SETTING_STORAGE_KEY, setting, localStorage);
}
