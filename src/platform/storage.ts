import { storage } from "wxt/storage";

export type LocalStoragePort = {
  getString(key: string): Promise<string>;
  setString(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getKeys(): Promise<string[]>;
};

function localKey(key: string) {
  return `local:${key}` as const;
}

export const extensionLocalStorage: LocalStoragePort = {
  async getString(key) {
    return (await storage.getItem<string>(localKey(key))) ?? "";
  },
  async setString(key, value) {
    await storage.setItem(localKey(key), value);
  },
  async removeItem(key) {
    await storage.removeItem(localKey(key));
  },
  async getKeys() {
    return Object.keys(await storage.snapshot("local"));
  }
};

export async function getLocalString(key: string, localStorage = extensionLocalStorage) {
  return localStorage.getString(key);
}

export async function setLocalString(key: string, value: string, localStorage = extensionLocalStorage) {
  await localStorage.setString(key, value);
}

export async function removeLocalItem(key: string, localStorage = extensionLocalStorage) {
  await localStorage.removeItem(key);
}

export async function getLocalJson<T>(key: string, fallback: T, localStorage = extensionLocalStorage): Promise<T> {
  const value = await getLocalString(key, localStorage);
  if (!value) return fallback;
  return JSON.parse(value) as T;
}

export async function setLocalJson<T>(key: string, value: T, localStorage = extensionLocalStorage) {
  await setLocalString(key, JSON.stringify(value), localStorage);
}
