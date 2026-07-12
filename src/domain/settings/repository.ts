import { extensionLocalStorage, getLocalJson, setLocalJson, type LocalStoragePort } from "../../platform/storage";
import { defaultUserSetting, type UserSetting } from "./schema";

export const USER_SETTING_STORAGE_KEY = "xingluotab:user-setting";

export async function getUserSetting(localStorage = extensionLocalStorage): Promise<UserSetting> {
  const stored = await getLocalJson<Partial<UserSetting>>(USER_SETTING_STORAGE_KEY, {}, localStorage);
  return {
    ...defaultUserSetting,
    ...stored,
    collapsedGroups: stored.collapsedGroups ?? []
  };
}

export async function saveUserSetting(setting: UserSetting, localStorage: LocalStoragePort = extensionLocalStorage) {
  await setLocalJson(USER_SETTING_STORAGE_KEY, setting, localStorage);
}

export async function saveLastVisitedSpaceId(spaceId: string, localStorage: LocalStoragePort = extensionLocalStorage) {
  const setting = await getUserSetting(localStorage);
  if (setting.lastVisitedSpaceId === spaceId) return setting;

  const nextSetting = {
    ...setting,
    lastVisitedSpaceId: spaceId
  };
  await saveUserSetting(nextSetting, localStorage);
  return nextSetting;
}
